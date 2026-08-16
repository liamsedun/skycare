"use client";

import { useEffect, useState } from "react";
import {
  AppWindow,
  Bell,
  Download,
  Loader2,
  Smartphone,
  TabletSmartphone,
} from "lucide-react";

const cardCls = "rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm";

type Platform = "iphone" | "android" | "windows" | "macos" | "ipad" | "other";

const PLATFORM_TIPS: Record<Platform, string[]> = {
  iphone: [
    "Open skycare in Safari.",
    "Tap the Share button (square with an up arrow) in the toolbar.",
    "Choose “Add to Home Screen”.",
    "Name it “SkyCare” and tap Add — the app icon appears on your home screen.",
    "Open SkyCare from the icon to use it full-screen like a native app.",
  ],
  android: [
    "Open skycare in Chrome on your Android device.",
    "You’ll see an “Install app” prompt at the bottom of the browser — tap it.",
    "Otherwise open the browser menu (⋮) → “Add to Home screen”.",
    "Tap “Install” and launch SkyCare from your app drawer.",
  ],
  windows: [
    "Open skycare in Microsoft Edge or Google Chrome on Windows.",
    "Look for the Install (monitor-with-arrow) icon in the address bar.",
    "Or open the browser menu → “Install this site as an app”.",
    "SkyCare opens in its own window and appears in your Start menu.",
  ],
  macos: [
    "Open skycare in Safari on macOS.",
    "Go to File → “Add to Dock” (or the Share menu → “Add to Dock”).",
    "SkyCare opens in a standalone app-style window from the Dock.",
  ],
  ipad: [
    "Open skycare in Safari.",
    "Tap the Share button → “Add to Home Screen”.",
    "SkyCare appears on your tablet home screen and supports split view.",
  ],
  other: [
    "On Linux or other platforms use Chrome or Edge.",
    "Click the install icon in the address bar to create an app shortcut.",
  ],
};

const PLATFORM_STEPS: { key: Platform; label: string; icon: typeof Smartphone }[] = [
  { key: "iphone", label: "iPhone", icon: Smartphone },
  { key: "android", label: "Android", icon: Smartphone },
  { key: "windows", label: "Windows", icon: AppWindow },
  { key: "macos", label: "macOS", icon: AppWindow },
  { key: "ipad", label: "iPad", icon: TabletSmartphone },
  { key: "other", label: "Linux / Desktop", icon: AppWindow },
];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function DownloadView() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [alreadyStandalone, setAlreadyStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [pushAvailable, setPushAvailable] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [deviceName, setDeviceName] = useState("This device");
  const [busy, setBusy] = useState(false);
  const [iosHint, setIosHint] = useState<"install" | "old" | null>(null);

  useEffect(() => {
    const isStandaloneNow =
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    setAlreadyStandalone(isStandaloneNow);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("Notification" in window) setPermission(Notification.permission);

    const ua = navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    const iosMajor = parseInt(ua.match(/OS (\d+)/)?.[1] ?? "0", 10);
    const iosMinor = parseInt(ua.match(/OS \d+_(\d+)/)?.[1] ?? "0", 10);
    if (isIos) {
      if (!isStandaloneNow) setIosHint("install");
      else if (iosMajor < 16 || (iosMajor === 16 && iosMinor < 4)) setIosHint("old");
    }

    fetch("/api/notifications/vapid-public-key", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setPushAvailable(Boolean(b.data?.configured && b.data?.publicKey)))
      .catch(() => setPushAvailable(false));

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  async function enablePush() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    setBusy(true);
    try {
      const ua = navigator.userAgent;
      const isIos =
        /iPhone|iPad|iPod/.test(ua) ||
        (ua.includes("Mac") && navigator.maxTouchPoints > 1);
      const standaloneNow =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const iosMajor = parseInt(ua.match(/OS (\d+)/)?.[1] ?? "0", 10);
      const iosMinor = parseInt(ua.match(/OS \d+_(\d+)/)?.[1] ?? "0", 10);

      if (isIos && !standaloneNow) {
        setIosHint("install");
        return;
      }
      if (isIos && (iosMajor < 16 || (iosMajor === 16 && iosMinor < 4))) {
        setIosHint("old");
        return;
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const keyRes = await fetch("/api/notifications/vapid-public-key", { cache: "no-store" });
      const keyBody = await keyRes.json();
      const publicKey: string | null = keyBody.data?.publicKey ?? null;
      if (!publicKey) {
        setPushAvailable(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const keys = sub.toJSON().keys as { p256dh?: string; auth?: string } | null;
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys,
          deviceName: deviceName.trim() || "This device",
        }),
      });
      setSubscribed(res.ok);
    } catch {
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint ?? null;
        if (sub) await sub.unsubscribe();
        if (endpoint) {
          await fetch("/api/notifications/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
      }
      setSubscribed(false);
      setPermission("default");
    } finally {
      setBusy(false);
    }
  }

  const canInstall = Boolean(installEvent) && !alreadyStandalone;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Download SkyCare</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Install SkyCare as an app on your phone, tablet, laptop or desktop — iOS, Android,
          Windows and macOS — then enable push notifications to keep working without opening
          the browser.
        </p>
      </div>

      <div className={`${cardCls} border-[var(--color-primary)]`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white">
              <Download size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-foreground)]">
                {alreadyStandalone
                  ? "SkyCare is already running as an app on this device"
                  : installed
                    ? "SkyCare is installed on this device"
                    : "Install SkyCare on this device"}
              </p>
              <p className="text-xs text-[var(--color-muted-fg)]">
                {alreadyStandalone
                  ? "Open it from your home screen or Start menu anytime."
                  : installed
                    ? "You can reinstall it on more devices from this page."
                    : canInstall
                      ? "Tap Install below to add the app with one click."
                      : "Use the browser install prompt in this browser's address bar."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            disabled={!canInstall}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-40"
          >
            <Download size={16} aria-hidden="true" />
            Install app
          </button>
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="text-base font-bold text-[var(--color-foreground)]">Install steps by device</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Tap a device to see how to install SkyCare on it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLATFORM_STEPS.map((p) => {
            const Icon = p.icon;
            return (
              <details
                key={p.key}
                open={iosHint === "install" && p.key === "iphone"}
                className="group rounded-lg border border-[var(--color-border)] p-3"
              >
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
                  <Icon size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
                  {p.label}
                </summary>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-[var(--color-muted-fg)]">
                  {PLATFORM_TIPS[p.key].map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </details>
            );
          })}
        </div>
      </div>

      <div className={cardCls}>
        <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-foreground)]">
          <Bell size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
          Enable push notifications
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted-fg)]">
          Register this device to receive alerts even when the app is closed.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="device-name" className="mb-1 block text-sm font-medium text-[var(--color-foreground)]">
              Device name
            </label>
            <input
              id="device-name"
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
              placeholder="e.g. Desk laptop, Office phone"
            />
          </div>
          <div className="flex items-end">
            {subscribed ? (
              <button
                type="button"
                onClick={disablePush}
                disabled={busy}
                className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : "Turn off push"}
              </button>
            ) : (
              <button
                type="button"
                onClick={enablePush}
                disabled={busy}
                className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} aria-hidden="true" />}
                {busy ? "Working…" : "Enable push notifications"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {subscribed ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
              This device is registered. You&apos;ll get alerts for appointments, payments, lab
              results and pharmacy updates.
            </p>
          ) : pushAvailable ? (
            <p className="rounded-lg bg-[var(--color-primary-soft)] px-3 py-2 text-[var(--color-primary-dark)]">
              SkyCare is ready to send you notifications. Allow the browser prompt to continue.
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              Your SkyCare deployment hasn&apos;t been configured with push keys yet, so true
              push alerts aren&apos;t enabled. In-app notifications and email still work.
            </p>
          )}
          {iosHint === "install" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              On an iPhone, push notifications only work from the installed SkyCare app, not
              inside Safari. Tap the Share button below and choose “Add to Home Screen”, then
              open SkyCare from your home screen and enable push there.
            </p>
          )}
          {iosHint === "old" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              Web push notifications need iOS 16.4 or later on iPhone. Please update your
              iPhone in Settings and try again.
            </p>
          )}
          {permission === "denied" && !iosHint && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
              Notification permission is blocked in this browser: open your browser&apos;s site
              settings and set Notifications to “Allow”, then try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

