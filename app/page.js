
"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [downloads, setDownloads] = useState([]);
  const [paid, setPaid] = useState(false);
  const [packageUsed, setPackageUsed] = useState(false);

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

    if (!selected.length) return;

    if (files.length + selected.length > 3) {
      setMsg("Maximum 3 videos per package. Buy another package for more videos.");
      event.target.value = "";
      return;
    }

    for (const file of selected) {
      if (!file.type.startsWith("video/")) {
        setMsg("Only video files are allowed.");
        event.target.value = "";
        return;
      }

      if (file.size > 250 * 1024 * 1024) {
        setMsg("Each video must be smaller than 250 MB.");
        event.target.value = "";
        return;
      }

      if (file.size === 0) {
        setMsg("Empty video files are not allowed.");
        event.target.value = "";
        return;
      }
    }

    setFiles((previous) => [...previous, ...selected]);
    setDownloads([]);
    setMsg(`${files.length + selected.length} of 3 videos selected.`);

    event.target.value = "";
  }

  function clearFiles() {
    if (busy) return;

    setFiles([]);
    setMsg("Selected videos removed.");
  }

  async function processVideos() {
    if (busy || packageUsed) return;

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
        setPackageUsed(true);
        setPaid(false);
        throw new Error(
          "This package has already been used. Buy another package to process more videos."
        );
      }

      if (r.status === 402) {
        throw new Error("Payment could not be verified.");
      }

      if (!r.ok) {
        throw new Error(d.error || "Processing failed.");
      }

      setDownloads(d.files || []);
      setFiles([]);
      setPackageUsed(true);
      setPaid(false);

      setMsg("Your package is complete! Your videos are ready.");

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
          workflow. Every package includes up to three videos.
        </p>

        <div className="offer">
          <strong>$10</strong>
          <span>
            one-time payment
            <br />
            up to 3 videos
          </span>
        </div>

        {!paid && (
          <button
            onClick={checkout}
            disabled={busy}
            className="primary"
          >
            {busy ? "Please wait…" : "Get started — $10"} <b>↗</b>
          </button>
        )}

        <p className="tiny">
          Secure card payment powered by Stripe · No subscription
        </p>
      </section>

      <section className="panel">
        <div className="panelhead">
          <div>
            <small>YOUR WORKSPACE</small>
            <h2>
              {paid
                ? "Payment confirmed"
                : packageUsed
                ? "Package completed"
                : "Start your order"}
            </h2>
          </div>

          <span className="count">01 / 03</span>
        </div>

        {paid && !packageUsed ? (
          <>
            <p className="muted">
              Your $10 payment is confirmed. Upload up to three videos.
            </p>

            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              disabled={busy || files.length >= 3}
              onChange={handleFiles}
            />

            <p className="muted">
              {files.length} of 3 videos selected
            </p>

            {files.length > 0 && (
              <div className="selected-files">
                {files.map((file, index) => (
                  <p key={`${file.name}-${index}`}>
                    {index + 1}. {file.name}
                  </p>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={clearFiles}
              >
                Clear selected videos
              </button>
            )}

            <button
              className="primary"
              disabled={busy || files.length === 0}
              onClick={processVideos}
            >
              {busy ? "Processing…" : "Upload and process"}
            </button>
          </>
        ) : packageUsed ? (
          <div className="locked">
            <h3>Your package is complete!</h3>
            <p>
              You can purchase another $10 package to process up to 3 more videos.
            </p>

            <button
              className="primary"
              onClick={checkout}
              disabled={busy}
            >
              {busy ? "Please wait…" : "Buy another package — $10"}
            </button>
          </div>
        ) : (
          <div className="locked">
            <div className="lock">↗</div>
            <h3>Upload unlocks after checkout</h3>
            <p>Pay $10, then upload up to three videos.</p>
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
            <h3>Pay $10</h3>
            <p>One package includes up to 3 videos.</p>
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
