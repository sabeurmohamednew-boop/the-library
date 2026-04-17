"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      setError("The password was not accepted.");
      return;
    }

    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <label className="label">
        Owner password
        <input
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error ? <p className="error-state">{error}</p> : null}
      <button className="button primary" type="submit" disabled={submitting}>
        {submitting ? "Checking" : "Open import"}
      </button>
    </form>
  );
}
