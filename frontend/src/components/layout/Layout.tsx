import { Outlet } from "react-router";
import { TopBar } from "./TopBar";

export function Layout() {
  return (
    <div className="min-h-screen bg-page">
      <TopBar />
      <Outlet />
    </div>
  );
}
