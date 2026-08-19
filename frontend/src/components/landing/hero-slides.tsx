"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const heroPhotos = [
  "/images/landing-page-images-skyblue-backgr/team-male-female-african-american-medical-staff-discussing-diagnostic-results.jpg",
  "/images/landing-page-images-skyblue-backgr/black-professional-team-people-explaining-x-ray.jpg",
];

export function SkyBlueBackdrop() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSlide((s) => (s + 1) % heroPhotos.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div aria-hidden="true" className="absolute inset-0">
        {heroPhotos.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes="100vw"
            className={`object-cover transition-opacity duration-1000 ease-in-out ${
              i === slide ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-sky-600/85 via-sky-600/75 to-blue-800/90" />
    </>
  );
}