import { Instrument_Sans, Instrument_Serif } from "next/font/google";

/** Headlines, taglines and the lettering printed in the storybook. */
export const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

/** UI sans for everything else, and the wordmark. */
export const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});
