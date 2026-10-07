import { notFound } from "next/navigation";
import Portraits from "./Portraits";

export const metadata = { title: "Example tree portraits", robots: { index: false } };

/** Development tool: renders the example trees' portraits. Not part of the live site. */
export default function PortraitsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Portraits />;
}
