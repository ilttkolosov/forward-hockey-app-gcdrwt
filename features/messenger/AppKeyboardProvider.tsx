import React from "react";

// iOS keeps its existing native keyboard behavior; web has no software IME layout.
export default function AppKeyboardProvider({ children }: React.PropsWithChildren) {
  return <>{children}</>;
}
