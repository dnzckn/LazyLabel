/**
 * Which of NVIDIA's files the AI bundles may carry, as patterns on a file's name. One place for
 * `build-release.mjs`, which acts on them, `release-smoke.mjs`, which checks the finished bundle, and
 * `api/test/nvidiaFiles.test.ts`, which pins them to real file names.
 *
 * Read from NVIDIA's own agreements on 2026-10-08 (DEPLOYABILITY.md R13):
 *
 * - The CUDA Toolkit agreement lets an application redistribute only the files its Attachment A
 *   lists, with version numbers or an architecture embedded in a name allowed (cudart64_12.dll for
 *   cudart.dll). The list names cudart, cuFFT and cuFFTW, cuBLAS and cuBLASLt, cuSPARSE, cuSOLVER,
 *   cuRAND, NVRTC and its builtins, nvJitLink, CUPTI, NVTX and cuFile among what PyTorch needs.
 * - cuDNN, cuSPARSELt and NVSHMEM each have an agreement of their own, and each lets an application
 *   redistribute its runtime files. NCCL is open source.
 * - PyTorch's CUDA packages also carry files none of those name: CUPTI's profiling helpers
 *   (nvperf_host, nvperf_target, libcheckpoint, libpcsamplingutil) and cuSOLVER's multi-GPU library
 *   (cusolverMg). LazyLabel uses none of them.
 */

/** Files the bundles leave out: NVIDIA's, and not on NVIDIA's list. Tested against every file's name. */
export const NVIDIA_NOT_LISTED = /^(lib)?nvperf_(host|target)|^libcheckpoint\.|^libpcsamplingutil\.|^(lib)?cusolverMg/i;

/** A file that looks like one of NVIDIA's shared libraries: cu* and nv* libraries, and NCCL. */
export const NVIDIA_FILE = /^(lib)?(cu[a-z]|nv|nccl)[^/\\]*?(\.dll|\.so(\.[\d.]+)?)$/i;

/** The families the agreements above cover. A family followed by another letter is another family. */
export const NVIDIA_COVERED =
  /^(lib)?(cudart|cublasLt|cublas|cufftw|cufft|curand|cusolver|cusparseLt|cusparse|cudnn|nvrtc|nvJitLink|cupti|nvToolsExt|nvtx3interop|cufile|nccl|nvshmem)(?![a-z])/i;

/** What to do with one file's name: "remove" it, "keep" it, "unknown" for NVIDIA's with no agreement named, or "other". */
export function classifyNvidiaFile(name) {
  if (NVIDIA_NOT_LISTED.test(name)) return "remove";
  if (!NVIDIA_FILE.test(name)) return "other";
  return NVIDIA_COVERED.test(name) ? "keep" : "unknown";
}
