import { useState } from "react";
import { LoginForm } from "@/components/LoginForm";
import { SignupForm } from "@/components/SignupForm";

function App() {
  const [view, setView] = useState<"login" | "signup">("login");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {view === "login" ? (
        <LoginForm onSwitchToSignup={() => setView("signup")} />
      ) : (
        <SignupForm onSwitchToLogin={() => setView("login")} />
      )}
    </div>
  );
}

export default App;
