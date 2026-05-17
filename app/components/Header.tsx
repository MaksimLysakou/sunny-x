import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center gap-3 mt-2">
      <Link
        href="/"
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <Image src="/sun.svg" alt="sunny-x" width={44} height={44} priority />
        <h1 className="text-2xl font-semibold tracking-tight">sunny-x</h1>
      </Link>
    </header>
  );
}
