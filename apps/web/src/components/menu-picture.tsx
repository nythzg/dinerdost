"use client";
import { useState } from "react";
import { Icon } from "./ui";
import type { Row } from "@/lib/client";

export function MenuPicture({ item }: { item: Row }) {
  const [failed, setFailed] = useState("");
  const show = item.image_url && failed !== item.image_url;
  return <span className="menu-picture">
    {show ? <img src={item.image_url} alt={(item.image_is_sample ? "Illustrative sample: " : "") + item.name} width={640} height={640} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(item.image_url)} /> : <Icon name={item.category?.toLowerCase().includes("bever") ? "cup" : "dish"} />}
    {show && item.image_is_sample && <small className="sample-photo-label">Sample photo</small>}
  </span>;
}
