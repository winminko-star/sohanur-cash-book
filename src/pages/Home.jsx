import DataTable from "../components/DataTable";

export default function Home() {
  function handleLogout() {
    sessionStorage.removeItem("cashbook_login");
    window.location.reload();
  }

  return (
    <main className="home-page">
      <header className="app-header">
        <div>
          <span className="app-small-title">SOHANUR</span>
          <h1>Cash Book</h1>
        </div>

        <button
          className="logout-small-button"
          type="button"
          onClick={handleLogout}
        >
          LOGOUT
        </button>
      </header>

      <DataTable />
    </main>
  );
}
