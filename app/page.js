
"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [downloads, setDownloads] = useState([]);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPaid(
      params.get("paid") === "1" &&
      !!params.get("session_id")
    );
  }, []);

  async function checkout() {
    if (busy) return;

    setBusy(true);
    setMsg("Opening secure checkout…");

    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error || "Checkout unavailable");
      }

      if (!d.url) {
        throw new Error("Checkout URL missing.");
      }

      window.location.href = d.url;

    } catch (e) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []);

    if (selected.length > 3) {
      setFiles([]);
      event.target.value = "";
      setMsg("You can select a maximum of 3 videos.");
      return;
    }

    for (const file of selected) {
      if (!file.type.startsWith("video/")) {
        setFiles([]);
        event.target.value = "";
        setMsg("Only video files are allowed.");
        return;
      }

      if (file.size > 250 * 1024 * 1024) {
        setFiles([]);
        event.target.value = "";
        setMsg("Each video must be smaller than 250 MB.");
        return;
      }

      if (file.size === 0) {
        setFiles([]);
        event.target.value = "";
        setMsg("An empty video file cannot be uploaded.");
        return;
      }
    }

    setFiles(selected);
    setDownloads([]);
    setMsg(
      selected.length
        ? `${selected.length} video(s) selected successfully.`
        : ""
    );
  }

  async function processVideos() {
    if (busy) return;

    if (!files.length || files.length > 3) {
      setMsg("Choose between 1 and 3 videos.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");

    if (!sid || !/^cs_(test|live)_/.test(sid)) {
      setMsg("Complete payment before uploading.");
      return;
    }

    const fd = new FormData();

    files.forEach((file) => {
      fd.append("videos", file);
    });

    fd.append("session_id", sid);

    setBusy(true);
    setDownloads([]);
    setMsg("Uploading and preparing your videos…");

    try {
      const r = await fetch("/api/process", {
        method: "POST",
        body: fd,
      });

      const d = await r.json();

      if (r.status === 409) {
        throw new Error(
          "This payment has already been used. Please complete a new payment."
        );
      }

      if (r.status === 402) {
        throw new Error(
          "Payment could not be verified. Please contact support."
        );
      }

      if (!r.ok) {
        throw new Error(d.error || "Processing failed.");
      }

      setDownloads(d.files || []);
      setMsg("Your edited files are ready. Download them below.");

      setFiles([]);

    } catch (e) {
      setMsg(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <nav>
        <a className="logo" href="/">
          FLASH<span>FRAME</span>
        </a>
        <span className="navnote">Simple video branding</span>
      </nav>

      <section className="hero">
        <div className="pill">VIDEO EDITING MADE SIMPLE</div>

        <h1>
          Make every video
          <br />
          <em>look unmistakably yours.</em>
        </h1>

        <p className="lead">
          Add consistent branding to your videos with a simple, fast editing
          workflow. Upload up to three videos in one order.
        </p>

        <div className="offer">
          <strong>$10</strong>
          <span>
            one-time payment
            <br />
            up to 3 videos
          </span>
        </div>

        <button
          onClick={checkout}
          disabled={busy}
          className="primary"
        >
          {busy ? "Please wait…" : "Get started — $10"} <b>↗</b>
        </button>

        <p className="tiny">
          Secure card payment powered by Stripe · No subscription
        </p>
      </section>

      <section className="panel">
        <div className="panelhead">
          <div>
            <small>YOUR WORKSPACE</small>
            <h2>{paid ? "Payment confirmed" : "Start your order"}</h2>
          </div>

          <span className="count">01 / 03</span>
        </div>

        {paid ? (
          <>
            <p className="muted">
              Your payment is confirmed. Upload up to three videos for branding edits.
            </p>

            <input
              type="file"
              accept="video/*"
              multiple
              disabled={busy}
              onChange={handleFiles}
            />

            <p className="muted">
              {files.length} of 3 videos selected
            </p>

            <button
              className="primary"
              disabled={busy || files.length === 0}
              onClick={processVideos}
            >
              {busy ? "Processing…" : "Upload and process"}
            </button>
          </>
        ) : (
          <div className="locked">
            <div className="lock">↗</div>
            <h3>Upload unlocks after checkout</h3>
            <p>Pay once, then upload up to three videos.</p>
          </div>
        )}

        <p className="status" role="status">
          {msg}
        </p>

        <div className="downloads">
          {downloads.map((file, index) => (
            <p key={file.filename}>
              <a
                className="download"
                href={file.url}
                download={`flashframe-${index + 1}.mp4`}
              >
                Download video {index + 1}
              </a>
            </p>
          ))}
        </div>
      </section>

      <section className="steps">
        <div>
          <small>HOW IT WORKS</small>
          <h2>Three steps. That's it.</h2>
        </div>

        <div className="stepgrid">
          <article>
            <b>01</b>
            <h3>Pay once</h3>
            <p>Secure $10 checkout with Stripe.</p>
          </article>

          <article>
            <b>02</b>
            <h3>Upload videos</h3>
            <p>Select up to three video files.</p>
          </article>

          <article>
            <b>03</b>
            <h3>Download</h3>
            <p>Get your processed files ready to use.</p>
          </article>
        </div>
      </section>

      <footer>
        © 2026 FlashFrame · Video branding tools
      </footer>
    </main>
  );
}
