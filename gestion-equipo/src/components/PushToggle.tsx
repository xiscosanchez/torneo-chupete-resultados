"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/push";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "ios-install" | "off" | "on" | "denied";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS Safari sin instalar: push solo disponible como PWA instalada
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true;
        setState(isIOS && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      const json = sub.toJSON();
      await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setState("on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  if (state === "ios-install") {
    return (
      <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-800">
        <p className="font-bold mb-1">📲 Instala la app para recibir avisos</p>
        <p>
          En iPhone: abre esta web en Safari → botón <strong>Compartir</strong> →{" "}
          <strong>Añadir a pantalla de inicio</strong>. Después abre la app instalada y
          activa las notificaciones aquí.
        </p>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-slate-500">
        Este navegador no soporta notificaciones push.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador para
        esta web.
      </div>
    );
  }

  return (
    <button
      onClick={state === "on" ? disable : enable}
      disabled={busy}
      className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-bold disabled:opacity-50 ${
        state === "on"
          ? "border border-slate-300 text-slate-600"
          : "bg-green-700 text-white active:bg-green-800"
      }`}
    >
      {state === "on" ? (
        <>
          <BellOff size={18} /> Desactivar notificaciones
        </>
      ) : (
        <>
          <Bell size={18} /> Activar notificaciones de convocatoria
        </>
      )}
    </button>
  );
}
