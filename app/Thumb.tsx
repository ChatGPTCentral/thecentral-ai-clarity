"use client";

import { useState } from "react";

/** Live page thumbnail via thum.io, with a graceful fallback if it can't load. */
export default function Thumb({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="ph-empty" />;
  return (
    <img
      className="pthumb"
      // Desktop viewport, cropped to the top ~portion = the above-the-fold view.
      src={`https://image.thum.io/get/viewportWidth/1440/width/640/crop/400/${url}`}
      alt=""
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}
