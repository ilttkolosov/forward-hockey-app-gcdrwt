import React, { useLayoutEffect } from "react";
import { usePathname } from "expo-router";
import { KeyboardProvider, useKeyboardController } from "react-native-keyboard-controller";

function ChatKeyboardScope({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { setEnabled } = useKeyboardController();
  const inChat = pathname.startsWith("/messenger/room/");
  useLayoutEffect(() => {
    setEnabled(inChat);
  }, [inChat, setEnabled]);
  return <>{children}</>;
}

export default function AppKeyboardProvider({ children }: React.PropsWithChildren) {
  return (
    <KeyboardProvider enabled={false} preload={false} statusBarTranslucent navigationBarTranslucent>
      <ChatKeyboardScope>{children}</ChatKeyboardScope>
    </KeyboardProvider>
  );
}
