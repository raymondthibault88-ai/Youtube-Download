# FFmpeg macOS sources and build information

The bundled macOS binary is FFmpeg 9.0.2, built by Martin Riedl on 20 September 2026. It is GPL version 3 or later and is built without --enable-nonfree. See LICENSE.txt and manifest.json alongside the binary.

The exact download URL, archive SHA256, executable SHA256 and build configuration URL are recorded in manifest.json for each architecture. The build provider publishes the compilation scripts, dependency source repositories and version inputs at https://git.martin-riedl.de/ffmpeg/build-script. The matching FFmpeg source release is https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz.

The build contains GPL components including x264 and x265. The precise library versions and build flags are recorded in the provider's versions.txt linked from the manifest. When redistributing binaries, provide the corresponding source for FFmpeg and its included libraries in accordance with their licenses; a generic link to the latest upstream source is not a substitute for corresponding source. This file identifies the binary provenance and does not change these obligations.
