"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { AppData } from "@/lib/types";
import { DataProvider } from "./DataProvider";
import { Sidebar } from "./Sidebar";
import { TaskModal } from "./TaskModal";
import { SpaceModal } from "./SpaceModal";
import { ChatWidget } from "./ChatWidget";

export function Shell({ initial, children }: { initial: AppData; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <DataProvider initial={initial}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={menu} onClose={() => setMenu(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
            <button onClick={() => setMenu(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="תפריט">
              <Menu size={20} />
            </button>
            <span className="font-bold">המשימות שלי</span>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <TaskModal />
      <SpaceModal />
      <ChatWidget />
    </DataProvider>
  );
}
