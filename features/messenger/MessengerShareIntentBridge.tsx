import { usePathname, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { useMessengerAuth } from "../../contexts/MessengerAuthContext";
import { messengerLog } from "../../services/messengerLogger";
import { trackMessengerAction } from "../../services/analyticsService";

const SHARE_ROUTE = "/messenger/share";

/**
 * Android delivers a share as an Activity intent, while iOS opens the app by
 * its custom URL scheme. The provider normalizes both payloads; this bridge
 * only owns navigation and deliberately leaves the payload intact until the
 * share screen either sends it successfully or the user cancels.
 */
export default function MessengerShareIntentBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useMessengerAuth();
  const { hasShareIntent, shareIntent, error } = useShareIntentContext();

  useEffect(() => {
    if (error) {
      messengerLog("warn", "share_intent.receive.failed", { message: error });
    }
  }, [error]);

  useEffect(() => {
    if (!hasShareIntent || pathname === SHARE_ROUTE) return;
    if (
      pathname.startsWith("/messenger/register") ||
      pathname.startsWith("/messenger/change-password")
    ) {
      return;
    }
    if (status === "loading" || status === "password_change_required") return;
    messengerLog("info", "share_intent.opened", {
      authenticated: status === "authenticated",
      content_type: shareIntent.type,
      file_count: shareIntent.files?.length ?? 0,
      has_text: Boolean(shareIntent.text || shareIntent.webUrl),
    });
    trackMessengerAction("share_sheet_opened", {
      content_type: shareIntent.type || "unknown",
      attachment_count: shareIntent.files?.length ?? 0,
      has_text: Boolean(shareIntent.text || shareIntent.webUrl),
      authenticated: status === "authenticated",
    });
    router.push(SHARE_ROUTE);
  }, [hasShareIntent, pathname, router, shareIntent, status]);

  return null;
}
