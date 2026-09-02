import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Both are barrel packages — importing one component pulls the whole
    // index into the module graph without this. `radix-ui` (the umbrella)
    // and `lucide-react` are used across nearly every screen.
    optimizePackageImports: ['radix-ui', 'lucide-react'],
  },
}

export default nextConfig
