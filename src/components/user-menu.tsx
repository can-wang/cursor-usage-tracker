"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface UserMenuProps {
  name: string;
  email: string;
  image?: string;
  signOutAction: () => Promise<void>;
}

export function UserMenu({ name, email, image, signOutAction }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        {image ? (
          <Image src={image} alt="" width={20} height={20} className="rounded-full" unoptimized />
        ) : (
          <span className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-300">
            {initials}
          </span>
        )}
        <span className="hidden sm:inline text-xs">{name.split(" ")[0]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl z-50 py-1">
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-xs font-medium text-zinc-200 truncate">{name}</p>
            <p className="text-[11px] text-zinc-500 truncate">{email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
