import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@meditaur/application",
    "@meditaur/audio-web",
    "@meditaur/db",
    "@meditaur/domain",
    "@meditaur/ui",
  ],
  async redirects() {
    return [{ source: "/dev/tuner", destination: "/tuner", permanent: false }];
  },
};

export default nextConfig;
