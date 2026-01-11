import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // ViewApp runs on port 4001 (set in package.json)
  // API routes internally call OCI Coordinator:
  //   - Primary API (status, tools, agents): Port 8001
  //   - Logs/Chat API: Port 3001

  // Fix turbopack root detection (we have our own package-lock.json)
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
