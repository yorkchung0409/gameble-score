import { Outlet } from "react-router-dom";
import { Toaster } from "@client/src/components/ui/sonner";

const Layout = () => {
  return (
    <div className="min-h-screen bg-[#F4F6F1]">
      <Toaster />
      <main className="mx-auto w-full max-w-[520px] px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
