
"use client";

import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [downloads, setDownloads] = useState([]);
  const [paid, setPaid] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");

    if (sid && /^cs_(test|live)_/.test(sid)) {
      setSessionId(sid);
      loadBalance(sid);
    }
  }, []);

  async function loadBalance(sid) {
    setBusy(true);
    setMsg("Verifying your package...");

    try {
      const r = await fetch(
        `/api/balance?session_id=${encodeURIComponent(sid)}`
      );
      const d = await r.json();

      if (!r.ok) throw new Error(d.error || "Payment verification failed.");

      setRemaining(d.remaining);
      setPaid(d.remaining > 0);
      setMsg(
        d.remaining > 0
          ? `${d.remaining} video credits available.`
          : "Package completed. Get another package to continue."
      );
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
      const r = await fetch("/api/checkout", { method: "POST" });
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

  function validateFiles(selected) {
    if (!selected.length) return;

    if (selected.length > remaining) {
      setMsg(`You can select only ${remaining} more video(s).`);
      return;
    }

    for (const file of selected) {
      if (!file.type.startsWith("video/")) {
        setMsg("Please select valid video files only.");
        return;
      }

      if (file.size > 250 * 1024 * 1024) {
        setMsg("Each video must be smaller than 250 MB.");
        return;
      }

      if (file.size === 0) {
        setMsg("Empty video files are not allowed.");
        return;
      }
    }

    setFiles(selected);
    setDownloads([]);
    setMsg(`${selected.length} video(s) ready to process.`);
  }

  function handleFiles(event) {
    validateFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    validateFiles(Array.from(event.dataTransfer.files || []));
  }

  async function processVideos() {
    if (busy || !sessionId || !files.length) return;

    if (files.length > remaining) {
      setMsg(`Only ${remaining} video(s) remaining.`);
      return;
    }

    const fd = new FormData();
    files.forEach((file) => fd.append("videos", file));
    fd.append("session_id", sessionId);

    setBusy(true);
    setDownloads([]);
    setMsg("Uploading and processing your videos...");

    try {
      const r = await fetch("/api/process", {
        method: "POST",
        body: fd,
      });

      const d = await r.json();

      if (r.status === 409) {
        throw new Error("Another processing request is in progress.");
      }

      if (!r.ok) throw new Error(d.error || "Processing failed.");

      setDownloads(d.files || []);
      setFiles([]);
      setRemaining(d.remaining);
      setPaid(d.remaining > 0);

      setMsg(
        d.remaining > 0
          ? `Successfully processed! ${d.remaining} credit(s) remaining.`
          : "All 3 videos completed. Thank you for using FlashFrame!"
      );
    } catch (e) {
      setMsg(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const used = 3 - remaining;

  return (
    <main className="site">
      <nav className="navbar">
        <a href="/" className="logo">
          FLASH<span>FRAME</span>
        </a>

        <div className="nav-right">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <button onClick={() => paid ? document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" }) : checkout()}>
            {paid ? "Open workspace" : "Get started"} <span>↗</span>
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-badge">
          <span className="live-dot" />
          SIMPLE VIDEO BRANDING
        </div>

        <h1>
          Your videos.
          <br />
          <span>Your identity.</span>
        </h1>

        <p className="hero-text">
          Add consistent branding to your videos with a simple,
          fast and effortless workflow.
        </p>

        <div className="hero-actions">
          <button className="main-button" onClick={checkout} disabled={busy}>
            {busy ? "Please wait..." : "Start creating — $10"}
            <span>↗</span>
          </button>
          <a href="#how" className="learn-button">Discover how it works ↓</a>
        </div>

        <div className="trust-line">
          <span>✓ Secure Stripe checkout</span>
          <span>✓ No subscription</span>
          <span>✓ Up to 3 videos</span>
        </div>

        <div className="hero-decoration">
          <div className="decor-card decor-one">
            <span>VIDEO BRANDING</span>
            <strong>Made simple.</strong>
            <small>FLASHFRAME STUDIO</small>
          </div>
          <div className="decor-card decor-two">
            <div className="decor-icon">✦</div>
            <strong>YOUR BRAND</strong>
            <small>YOUR CONTENT</small>
          </div>
        </div>
      </section>

      <section className="pricing-strip" id="pricing">
        <div>
          <small>ONE SIMPLE PACKAGE</small>
          <h2>Everything you need to get started.</h2>
          <p>One payment. No recurring fees. No subscription.</p>
        </div>
        <div className="price">
          <strong>$10</strong>
          <span>one-time payment</span>
          <small>Up to 3 videos</small>
        </div>
        <button className="main-button" onClick={checkout} disabled={busy}>
          Get your package ↗
        </button>
      </section>

      <section className="workspace-section" id="workspace">
        <div className="section-heading">
          <span className="eyebrow">YOUR CREATIVE SPACE</span>
          <h2>Your workspace.</h2>
          <p>Upload your videos and let FlashFrame handle the branding.</p>
        </div>

        <div className="workspace">
          <div className="workspace-top">
            <div>
              <span className="eyebrow">FLASHFRAME STUDIO</span>
              <h3>{paid ? "Your active package" : "Your package"}</h3>
            </div>
            <span className={`package-status ${paid ? "active" : ""}`}>
              {paid ? "● ACTIVE" : "● NOT ACTIVE"}
            </span>
          </div>

          {paid ? (
            <>
              <div className="credits">
                <div className="credits-info">
                  <span>VIDEO CREDITS</span>
                  <strong>{remaining}<small> / 3 remaining</small></strong>
                </div>
                <div className="progress">
                  <div style={{ width: `${(used / 3) * 100}%` }} />
                </div>
              </div>

              <div
                className={`upload-zone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !busy && fileInput.current?.click()}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="video/*"
                  multiple
                  hidden
                  disabled={busy}
                  onChange={handleFiles}
                />

                <div className="upload-icon">↑</div>
                <h3>Drop your videos here</h3>
                <p>or click to browse files from your device</p>
                <span className="file-limit">MP4 · MOV · WEBM · MAX 250 MB EACH</span>
              </div>

              {files.length > 0 && (
                <div className="selected-list">
                  <div className="list-title">
                    <strong>Selected videos</strong>
                    <button onClick={() => setFiles([])} disabled={busy}>
                      Clear all
                    </button>
                  </div>
                  {files.map((file, index) => (
                    <div className="file-row" key={`${file.name}-${index}`}>
                      <span className="file-icon">▶</span>
                      <div>
                        <strong>{file.name}</strong>
                        <small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small>
                      </div>
                      <span className="file-check">✓</span>
                    </div>
                  ))}
                  <button
                    className="main-button process-button"
                    disabled={busy}
                    onClick={processVideos}
                  >
                    {busy ? "Processing your videos..." : "Process my videos →"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="locked">
              <div className="lock-icon">✦</div>
              <h3>
                {remaining === 0 && sessionId
                  ? "Your package is complete"
                  : "Unlock your workspace"}
              </h3>
              <p>
                {remaining === 0 && sessionId
                  ? "Purchase another package to process 3 more videos."
                  : "Get access to your video branding workspace with one simple payment."}
              </p>
              <button className="main-button" onClick={checkout} disabled={busy}>
                {busy ? "Please wait..." : "Buy package — $10 ↗"}
              </button>
            </div>
          )}

          {busy && (
            <div className="loading-line">
              <span />
            </div>
          )}

          {msg && (
            <div className="status-message" role="status">
              <span>●</span> {msg}
            </div>
          )}

          {downloads.length > 0 && (
            <div className="downloads">
              <h3>Your videos are ready</h3>
              <p>Your processed files are available below.</p>
              {downloads.map((file, index) => (
                <a
                  className="download-card"
                  key={file.filename}
                  href={file.url}
                  download={`flashframe-${index + 1}.mp4`}
                >
                  <span className="download-icon">↓</span>
                  <span>
                    <strong>Download video {index + 1}</strong>
                    <small>MP4 · Ready to download</small>
                  </span>
                  <b>↗</b>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="features" id="features">
        <div className="section-heading">
          <span className="eyebrow">WHY FLASHFRAME</span>
          <h2>Less work. More consistency.</h2>
          <p>A straightforward workflow designed to save you time.</p>
        </div>

        <div className="feature-grid">
          <article>
            <div className="feature-icon">✦</div>
            <h3>Consistent branding</h3>
            <p>Give your videos a recognizable visual identity.</p>
          </article>
          <article>
            <div className="feature-icon">↗</div>
            <h3>Simple workflow</h3>
            <p>Upload your files and process them in a few steps.</p>
          </article>
          <article>
            <div className="feature-icon">↓</div>
            <h3>Easy downloads</h3>
            <p>Download your processed videos when they are ready.</p>
          </article>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="section-heading">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2>Three steps. That's it.</h2>
        </div>

        <div className="steps">
          <article>
            <span>01</span>
            <h3>Get your package</h3>
            <p>Pay $10 once and unlock up to three video edits.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Upload your videos</h3>
            <p>Select your videos and send them to FlashFrame.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Download your files</h3>
            <p>Get your processed videos ready to use.</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <a href="/" className="logo">FLASH<span>FRAME</span></a>
        <p>Simple video branding, made effortless.</p>
        <small>© 2026 FlashFrame. All rights reserved.</small>
      </footer>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
          margin: 0;
          background: #080d18;
          color: #f4f7ff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button, a { font: inherit; }
        button { cursor: pointer; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        a { color: inherit; text-decoration: none; }
        .site { max-width: 1180px; padding: 0 28px; margin: auto; overflow: hidden; }
        .navbar { height: 88px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1b2639; }
        .logo { font-size: 21px; font-weight: 900; letter-spacing: 1.5px; }
        .logo span { color: #85e8c7; }
        .nav-right { display: flex; align-items: center; gap: 30px; color: #aab7cb; font-size: 13px; }
        .nav-right a:hover { color: #85e8c7; }
        .nav-right button { border: 1px solid #34445c; color: white; background: #131d2e; padding: 12px 17px; border-radius: 10px; }
        .nav-right button span { color: #85e8c7; margin-left: 9px; }
        .hero { text-align: center; padding: 105px 0 85px; position: relative; }
        .hero-badge { display: inline-flex; align-items: center; gap: 9px; border: 1px solid #30415a; border-radius: 30px; padding: 9px 15px; font-size: 10px; letter-spacing: 2px; color: #a8f2d8; font-weight: 800; }
        .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #80e7c2; box-shadow: 0 0 12px #80e7c2; }
        .hero h1 { font-size: clamp(48px, 8vw, 86px); line-height: 1.04; letter-spacing: -5px; margin: 30px 0 22px; font-weight: 850; }
        .hero h1 span { color: #89e9c9; }
        .hero-text { color: #a8b4c8; font-size: 17px; line-height: 1.8; max-width: 610px; margin: 0 auto; }
        .hero-actions { display: flex; justify-content: center; align-items: center; gap: 24px; margin-top: 32px; flex-wrap: wrap; }
        .main-button { background: #8cebc9; color: #07140f; border: 0; border-radius: 11px; padding: 16px 24px; font-weight: 850; transition: .2s; }
        .main-button:hover { background: #adf5dc; transform: translateY(-2px); }
        .main-button span { margin-left: 14px; }
        .learn-button { color: #bdc9d9; font-size: 13px; }
        .trust-line { display: flex; justify-content: center; flex-wrap: wrap; gap: 25px; color: #8292a9; font-size: 11px; margin-top: 27px; }
        .trust-line span::first-letter { color: #8cebc9; }
        .hero-decoration { height: 150px; max-width: 600px; margin: 55px auto 0; position: relative; }
        .decor-card { position: absolute; border: 1px solid #30415a; background: linear-gradient(140deg,#17243a,#0e1727); border-radius: 17px; padding: 20px; text-align: left; box-shadow: 0 20px 60px #0005; }
        .decor-one { width: 260px; left: 4%; top: 0; transform: rotate(-5deg); }
        .decor-two { width: 220px; right: 5%; top: 22px; transform: rotate(5deg); }
        .decor-card span,.decor-card small { display: block; font-size: 9px; letter-spacing: 2px; color: #8cebc9; }
        .decor-card strong { display: block; font-size: 23px; margin: 12px 0; }
        .decor-card small { color: #8999b0; }
        .decor-icon { color: #8cebc9; font-size: 30px; }
        .pricing-strip { border: 1px solid #293a52; background: #111b2c; border-radius: 20px; padding: 30px 35px; display: flex; align-items: center; justify-content: space-between; gap: 25px; margin: 20px 0 110px; }
        .pricing-strip small,.eyebrow { color: #8cebc9; letter-spacing: 2px; font-size: 10px; font-weight: 850; }
        .pricing-strip h2 { font-size: 22px; margin: 9px 0; }
        .pricing-strip p { color: #91a0b6; font-size: 13px; margin: 0; }
        .price { display: flex; flex-direction: column; min-width: 130px; }
        .price strong { font-size: 39px; }
        .price span,.price small { color: #9aa9bd; font-size: 11px; }
        .workspace-section { padding: 25px 0 105px; }
        .section-heading { text-align: center; margin-bottom: 38px; }
        .section-heading h2 { font-size: clamp(30px,5vw,43px); letter-spacing: -1.5px; margin: 13px 0; }
        .section-heading p { color: #94a3b8; font-size: 14px; line-height: 1.7; }
        .workspace { max-width: 760px; margin: auto; border: 1px solid #2b3b53; border-radius: 22px; padding: 30px; background: linear-gradient(145deg,#121e31,#0d1625); box-shadow: 0 30px 90px #0004; }
        .workspace-top { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding-bottom: 24px; border-bottom: 1px solid #29374c; }
        .workspace-top h3 { font-size: 23px; margin: 9px 0 0; }
        .package-status { font-size: 10px; letter-spacing: 1px; color: #e8bd76; border: 1px solid #655238; border-radius: 20px; padding: 8px 11px; }
        .package-status.active { color: #8cebc9; border-color: #315e50; }
        .credits { padding: 24px 0; }
        .credits-info { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .credits-info span { color: #9babc0; font-size: 10px; letter-spacing: 1.5px; font-weight: 800; }
        .credits-info strong { font-size: 22px; color: #8cebc9; }
        .credits-info small { font-size: 12px; color: #9aa9bd; font-weight: 500; }
        .progress { height: 7px; background: #27364a; border-radius: 20px; overflow: hidden; }
        .progress div { height: 100%; background: #8cebc9; border-radius: 20px; transition: width .3s; }
        .upload-zone { border: 1px dashed #52647e; border-radius: 17px; padding: 42px 15px; text-align: center; cursor: pointer; background: #0d1727; transition: .2s; }
        .upload-zone:hover,.upload-zone.dragging { border-color: #8cebc9; background: #14283a; }
        .upload-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; margin: 0 auto 17px; background: #1b3541; color: #8cebc9; font-size: 28px; }
        .upload-zone h3 { margin: 0 0 9px; font-size: 17px; }
        .upload-zone p { color: #9aa9bd; font-size: 13px; margin: 0 0 17px; }
        .file-limit { font-size: 9px; letter-spacing: 1.5px; color: #71839c; }
        .selected-list { margin-top: 25px; }
        .list-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .list-title strong { font-size: 13px; }
        .list-title button { background: none; border: 0; color: #8cebc9; font-size: 12px; }
        .file-row { display: flex; align-items: center; gap: 13px; padding: 13px; background: #172438; border: 1px solid #293b54; border-radius: 12px; margin-top: 8px; }
        .file-icon { color: #8cebc9; }
        .file-row div { min-width: 0; flex: 1; }
        .file-row strong,.file-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-row strong { font-size: 12px; }
        .file-row small { color: #8999ae; font-size: 10px; margin-top: 4px; }
        .file-check { color: #8cebc9; }
        .process-button { width: 100%; margin-top: 17px; }
        .locked { text-align: center; padding: 50px 15px; }
        .lock-icon { font-size: 35px; color: #8cebc9; margin-bottom: 14px; }
        .locked h3 { font-size: 23px; }
        .locked p { max-width: 400px; color: #9aa9bd; line-height: 1.7; font-size: 13px; margin: 0 auto 22px; }
        .status-message { padding: 13px 15px; border-radius: 10px; background: #172a32; color: #a6ebd1; font-size: 12px; margin-top: 20px; line-height: 1.6; overflow-wrap: anywhere; }
        .status-message span { margin-right: 8px; }
        .loading-line { height: 3px; background: #25354a; margin-top: 18px; overflow: hidden; border-radius: 5px; }
        .loading-line span { display: block; width: 35%; height: 100%; background: #8cebc9; animation: loading 1.3s infinite ease-in-out; }
        @keyframes loading { from { transform: translateX(-120%); } to { transform: translateX(350%); } }
        .downloads { margin-top: 25px; }
        .downloads h3 { font-size: 17px; margin-bottom: 5px; }
        .downloads > p { font-size: 12px; color: #91a0b6; margin-bottom: 15px; }
        .download-card { display: flex; align-items: center; gap: 14px; border: 1px solid #2c4356; background: #142436; padding: 15px; border-radius: 12px; margin-top: 9px; }
        .download-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: #1e3d3b; color: #8cebc9; font-size: 21px; }
        .download-card > span:nth-child(2) { flex: 1; }
        .download-card strong,.download-card small { display: block; }
        .download-card strong { font-size: 12px; }
        .download-card small { color: #91a0b6; font-size: 10px; margin-top: 4px; }
        .download-card > b { color: #8cebc9; }
        .features { padding: 45px 0 100px; }
        .feature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feature-grid article,.steps article { border: 1px solid #26364d; background: #101a2a; padding: 25px; border-radius: 16px; }
        .feature-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: #1b3541; color: #8cebc9; font-size: 20px; }
        .feature-grid h3,.steps h3 { font-size: 16px; margin: 20px 0 9px; }
        .feature-grid p,.steps p { font-size: 12px; color: #94a3b8; line-height: 1.7; margin: 0; }
        .how-section { padding: 20px 0 100px; }
        .steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .steps article > span { color: #8cebc9; font-size: 13px; font-weight: 900; letter-spacing: 1px; }
        .footer { padding: 30px 0 40px; border-top: 1px solid #26364d; text-align: center; }
        .footer p { color: #94a3b8; font-size: 12px; margin: 12px 0; }
        .footer small { color: #66768d; font-size: 10px; }
        @media(max-width:750px) {
          .site { padding: 0 17px; }
          .navbar { height: 72px; }
          .nav-right { gap: 12px; }
          .nav-right a { display: none; }
          .nav-right button { padding: 10px 12px; font-size: 11px; }
          .hero { padding: 80px 0 65px; }
          .hero h1 { letter-spacing: -2.5px; }
          .hero-text { font-size: 14px; }
          .hero-decoration { transform: scale(.8); margin-top: 25px; }
          .pricing-strip { flex-wrap: wrap; padding: 24px; margin-bottom: 75px; }
          .pricing-strip > div:first-child { width: 100%; }
          .pricing-strip h2 { font-size: 19px; }
          .workspace { padding: 19px; }
          .workspace-top h3 { font-size: 19px; }
          .feature-grid,.steps { grid-template-columns: 1fr; }
          .features,.how-section,.workspace-section { padding-bottom: 70px; }
        }
        @media(max-width:420px) {
          .hero-actions { flex-direction: column; }
          .trust-line { gap: 12px; }
          .decor-one { left: -5%; }
          .decor-two { right: -7%; }
          .workspace-top { align-items: flex-start; flex-direction: column; }
        }
      `}</style>
    </main>
  );
}
