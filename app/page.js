
"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [downloads, setDownloads] = useState([]);
  const [paid, setPaid] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");

    if (!sid || !/^cs_(test|live)_/.test(sid)) {
      return;
    }

    setSessionId(sid);
    loadBalance(sid);
  }, []);

  async function loadBalance(sid) {
    setBusy(true);
    setMsg("Checking your package...");

    try {
      const r = await fetch(
        `/api/balance?session_id=${encodeURIComponent(sid)}`
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.error || "Payment verification failed.");
      }

      setRemaining(d.remaining);
      setPaid(d.remaining > 0);

      if (d.remaining === 0) {
        setMsg("Your package is complete. Buy another package.");
      } else {
        setMsg(`You have ${d.remaining} video(s) remaining.`);
      }
    } catch (e) {
      setPaid(false);
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (busy) return;

    setBusy(true);
    setMsg("Opening secure checkout...");

    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
      });

      const d = await r.json();

      if (!r.ok || !d.url) {
        throw new Error(d.error || "Checkout unavailable.");
      }

      window.location.href = d.url;
    } catch (e) {
      setMsg(e.message);
      setBusy(false);
    }
  }

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []);

    if (selected.length > remaining) {
      setMsg(`Only ${remaining} video(s) remaining.`);
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

    setFiles(selected);
    setDownloads([]);
    setMsg(`${selected.length} video(s) selected.`);
    event.target.value = "";
  }

  async function processVideos() {
    if (busy || !sessionId) return;

    if (!files.length || files.length > remaining) {
      setMsg(`Choose between 1 and ${remaining} videos.`);
      return;
    }

    const fd = new FormData();

    files.forEach((file) => fd.append("videos", file));
    fd.append("session_id", sessionId);

    setBusy(true);
    setDownloads([]);
    setMsg("Uploading and preparing your videos...");

    try {
      const r = await fetch("/api/process", {
        method: "POST",
        body: fd,
      });

      const d = await r.json();

      if (r.status === 409) {
        throw new Error("Another processing request is in progress.");
      }

      if (!r.ok) {
        throw new Error(d.error || "Processing failed.");
      }

      setDownloads(d.files || []);
      setFiles([]);
      setRemaining(d.remaining);
      setPaid(d.remaining > 0);

      setMsg(
        d.remaining > 0
          ? `Success! ${d.remaining} video(s) remaining.`
          : "Package completed! Buy another package."
      );
    } catch (e) {
      setMsg(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <nav>
        <a className="logo" href="/">FLASH<span>FRAME</span></a>
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
          <span>one-time payment<br />up to 3 videos</span>
        </div>

        {!paid && (
          <button
            onClick={checkout}
            disabled={busy}
            className="primary"
          >
            {busy ? "Please wait..." : "Get started — $10"} <b>↗</b>
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
            <h2>{paid ? "Payment confirmed" : "Your package"}</h2>
          </div>
          <span className="count">01 / 03</span>
        </div>

        {paid ? (
          <>
            <h3>{remaining} of 3 videos remaining</h3>

            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              disabled={busy}
              onChange={handleFiles}
            />

            <p className="muted">
              {files.length} video(s) selected
            </p>

            {files.map((file, index) => (
              <p key={`${file.name}-${index}`}>{file.name}</p>
            ))}

            {files.length > 0 && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setFiles([])}
              >
                Clear selected videos
              </button>
            )}

            <button
              className="primary"
              disabled={busy || files.length === 0}
              onClick={processVideos}
            >
              {busy ? "Processing..." : "Upload and process"}
            </button>
          </>
        ) : (
          <div className="locked">
            <h3>
              {remaining === 0
                ? "Package completed!"
                : "Purchase a package"}
            </h3>

            <p>
              {remaining === 0
                ? "Buy another $10 package for 3 more videos."
                : "Complete your $10 payment to upload videos."}
            </p>

            <button
              className="primary"
              onClick={checkout}
              disabled={busy}
            >
              {busy ? "Please wait..." : "Buy package — $10"}
            </button>
          </div>
        )}

        <p className="status" role="status">{msg}</p>

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

      <footer>© 2026 FlashFrame · Video branding tools</footer>
    </main>
  );
}
