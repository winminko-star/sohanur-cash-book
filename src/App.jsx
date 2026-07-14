import { useState } from "react";
import Login from "./components/Login";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => sessionStorage.getItem("cashbook_login") === "true"
  );

  function handleLogout() {
    sessionStorage.removeItem("cashbook_login");
    setIsLoggedIn(false);
  }

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <main className="temporary-home">
      <section className="temporary-card">
        <h1>Sohanur Cash Book</h1>

        <p>Login အောင်မြင်ပါတယ်။</p>

        <button
          className="logout-button"
          type="button"
          onClick={handleLogout}
        >
          LOGOUT
        </button>
      </section>
    </main>
  );
}
