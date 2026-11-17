import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="app">
      <Sidebar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
