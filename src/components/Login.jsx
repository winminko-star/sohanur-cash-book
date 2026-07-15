 import { useState } from "react";

const USERNAME = "Sohanur";
const PASSWORD = "006007";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (
      username.trim() === USERNAME &&
      password === PASSWORD
    ) {
      localStorage.setItem("cashbook_login", "true");
      onLogin();
      return;
    }

    setError("Incorrect username or password.");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">💰</div>

        <h1>Sohanur Cash Book</h1>

        <p className="login-subtitle">
  Login to access the cash book
</p>

        <form onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="username">
            Username
          </label>

          <input
            id="username"
            className="login-input"
            type="text"
            placeholder="Enter username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <label className="form-label" htmlFor="password">
            Password
          </label>

          <div className="password-box">
            <input
              id="password"
              className="login-input password-input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label="Show or hide password"
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="login-button" type="submit">
            LOGIN
          </button>
        </form>

        <p className="login-footer">
          Secure Cash Book
        </p>
      </section>
    </main>
  );
}
