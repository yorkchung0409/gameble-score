import { Outlet } from "react-router-dom";
import { Toaster } from "@client/src/components/ui/sonner";

const Layout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(145_60%_14%)] to-[hsl(145_70%_6%)]">
      <Toaster />
      <main className="mx-auto w-full max-w-[520px] px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
