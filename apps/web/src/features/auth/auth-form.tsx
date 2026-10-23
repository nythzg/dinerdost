"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Form, Logo, Icon, type Field } from "@/components/ui";
import { request } from "@/lib/client";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields: Field[] = signup
    ? [
        { name: "name", label: "Your name" },
        { name: "restaurant", label: "Restaurant name" },
        { name: "outlet", label: "First outlet" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Password",
          type: "password",
          help: "At least 12 characters.",
        },
        {
          name: "qrPolicy",
          label: "Customer QR ordering",
          type: "select",
          value: "off",
          options: [
            { value: "off", label: "Off · staff take orders" },
            { value: "on", label: "On · scan to order" },
          ],
        },
        {
          name: "demo",
          label: "Add a sample menu and 12 tables",
          type: "checkbox",
          help: "Demo data only.",
        },
      ]
    : [
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Password",
          type: "password",
          autoComplete: "current-password",
        },
      ];
  return (
    <main className="auth">
      <aside className="auth-story">
        <Logo />
        <div className="auth-art" aria-hidden="true">
          <div className="auth-art-tile">
            <Icon name="floor" />
          </div>
          <div className="auth-art-tile">
            <Icon name="orders" />
          </div>
          <div className="auth-art-tile">
            <Icon name="qr" />
          </div>
          <div className="auth-art-tile">
            <Icon name="kitchen" />
          </div>
        </div>
        <span className="auth-footer">Built for service.</span>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <div className="mobile-logo">
            <Logo />
          </div>
          <h1>{signup ? "Create workspace" : "Sign in"}</h1>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Form
            fields={fields}
            busy={busy}
            submit={signup ? "Create workspace" : "Sign in"}
            onSubmit={async (values) => {
              setBusy(true);
              setError("");
              try {
                const input = signup
                  ? {
                      name: values.name,
                      restaurant: values.restaurant,
                      outlet: values.outlet,
                      email: values.email,
                      password: values.password,
                      demo: values.demo,
                      qrEnabled: values.qrPolicy === "on",
                    }
                  : values;
                await request("/api/auth/" + (signup ? "signup" : "login"), {
                  method: "POST",
                  body: JSON.stringify(input),
                });
                router.push("/app/overview");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <p className="auth-switch">
            {signup ? "Already have a workspace?" : "New to Diner Dost?"}{" "}
            <Link href={signup ? "/signin" : "/signup"}>
              {signup ? "Sign in" : "Create workspace"}
            </Link>
          </p>
          {!signup&&<p className="auth-switch"><Link href="/superadmin/signin">Superadmin sign in</Link></p>}
        </div>
      </section>
    </main>
  );
}
