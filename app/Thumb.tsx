"use client";

import { useState } from "react";

/** Live page thumbnail via thum.io, with a graceful fallback if it can't load. */
export default function Thumb({ url }: { url: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="ph-empty" />;
  return (
    <img
      className="pthumb"
      src={`https://image.thum.io/get/width/240/crop/150/${url}`}
      alt=""
      loading="lazy"
      onError={() => setOk(false)}
    />
  );
}
