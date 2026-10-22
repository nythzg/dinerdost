"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Logo } from "./ui";

type CardProps = {
  url: string;
  label: string;
  restaurant?: string;
  outlet?: string;
};

export function useQrImage(url: string) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    setError("");
    void QRCode.toDataURL(url, {
      width: 720,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#172239", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setImage(value);
      })
      .catch(() => {
        if (active) setError("Couldn't generate this QR. Please reload.");
      });
    return () => {
      active = false;
    };
  }, [url]);
  return { image, error };
}

export function QrCard({
  image,
  label,
  restaurant,
  outlet,
}: {
  image: string;
  label: string;
  restaurant: string;
  outlet?: string;
}) {
  return (
    <div className="qr-print-card">
      <span className="qr-restaurant">{restaurant}</span>
      {outlet && <span className="qr-outlet">{outlet}</span>}
      <h2>{label}</h2>
      {image ? (
        <img
          src={image}
          alt={"Customer QR for " + label}
          width="240"
          height="240"
        />
      ) : (
        <div className="qr-placeholder">Preparing QR…</div>
      )}
      <strong>Scan to order</strong>
      <Logo />
    </div>
  );
}

// Draw the complete table card so the downloaded image is ready to print.
export async function downloadQrCard(props: CardProps, image: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("This browser cannot save the QR card. Use Print instead.");
  const qr = new Image();
  qr.src = image;
  await qr.decode();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 900, 1200);
  ctx.strokeStyle = "#dce5d8";
  ctx.lineWidth = 4;
  ctx.strokeRect(25, 25, 850, 1150);
  ctx.textAlign = "center";
  ctx.fillStyle = "#172239";
  const fitText = (value: string, y: number, size: number) => {
    ctx.font = "600 " + size + "px Arial";
    while (ctx.measureText(value).width > 760 && size > 14) {
      size -= 2;
      ctx.font = "600 " + size + "px Arial";
    }
    ctx.fillText(value, 450, y, 760);
  };
  fitText(props.restaurant ?? "Diner Dost", 110, 40);
  ctx.fillStyle = "#758198";
  fitText(props.outlet ?? "", 155, 24);
  ctx.fillStyle = "#172239";
  fitText(props.label, 245, 66);
  ctx.drawImage(qr, 135, 285, 630, 630);
  fitText("Scan to order", 985, 48);
  ctx.fillStyle = "#758198";
  ctx.fillStyle = "#3858f5";
  fitText("Diner Dost", 1120, 28);
  const a = document.createElement("a");
  a.download = "Table-" + props.label.replace(/[^a-z0-9_-]/gi, "-") + "-QR.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export function TableQr(props: CardProps) {
  const { image, error } = useQrImage(props.url);
  const [message, setMessage] = useState("");
  return (
    <div className="table-qr">
      <QrCard
        image={image}
        label={props.label}
        restaurant={props.restaurant ?? "Diner Dost"}
        outlet={props.outlet}
      />
      {(error || message) && <p role="alert">{error || message}</p>}
      <button
        className="button primary"
        disabled={!image}
        onClick={() =>
          void downloadQrCard(props, image).catch((e) => setMessage(e.message))
        }
      >
        Download card
      </button>
      <a href={props.url} target="_blank" rel="noreferrer">
        Open customer menu
      </a>
    </div>
  );
}
