import { DM_Serif_Display, Instrument_Sans, Instrument_Serif } from "next/font/google";

/** The Treendr wordmark. */
export const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  subsets: ["latin"],
});

/** Headlines, taglines and the lettering printed in the storybook. */
export const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

/** UI sans for everything else. */
export const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});
