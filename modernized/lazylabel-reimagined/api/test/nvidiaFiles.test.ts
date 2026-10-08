/**
 * Which of NVIDIA's files the AI bundles carry: DEPLOYABILITY.md R13.
 *
 * `scripts/nvidia-files.mjs` holds the rules and `build-release.mjs` acts on them: a file NVIDIA's
 * CUDA agreement does not list is left out, a file one of its agreements covers is kept, and an
 * NVIDIA file that no agreement read on 2026-10-08 names stops the build. The names below are the
 * real ones: the 55 files of PyTorch 2.10.0+cu128's Windows `torch/lib`, and the shared libraries of
 * the Linux `nvidia-*` wheels, read from their zip directories. A new PyTorch with a new library
 * fails the build, and this test is where its name is added once the agreement has been read.
 */

import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Verdict = "remove" | "keep" | "unknown" | "other";
const rules = (await import(
  pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "scripts", "nvidia-files.mjs")).href
)) as { classifyNvidiaFile(name: string): Verdict };

const classify = (names: readonly string[]) => {
  const by: Record<Verdict, string[]> = { remove: [], keep: [], unknown: [], other: [] };
  for (const name of names) by[rules.classifyNvidiaFile(name)].push(name);
  return by;
};

/** `torch/lib` in the Windows cu128 wheel: PyTorch's own files, and NVIDIA's inside them. */
const WINDOWS = [
  "asmjit.dll", "c10.dll", "c10_cuda.dll", "caffe2_nvrtc.dll", "libiomp5md.dll", "shm.dll", "torch.dll",
  "torch_cpu.dll", "torch_cuda.dll", "torch_global_deps.dll", "torch_python.dll", "uv.dll", "zlibwapi.dll",
  "cublas64_12.dll", "cublasLt64_12.dll", "cudart64_12.dll", "cudnn64_9.dll", "cudnn_adv64_9.dll",
  "cudnn_cnn64_9.dll", "cudnn_engines_precompiled64_9.dll", "cudnn_engines_runtime_compiled64_9.dll",
  "cudnn_graph64_9.dll", "cudnn_heuristic64_9.dll", "cudnn_ops64_9.dll", "cufft64_11.dll", "cufftw64_11.dll",
  "cupti64_2025.1.1.dll", "curand64_10.dll", "cusolver64_11.dll", "cusolverMg64_11.dll", "cusparse64_12.dll",
  "nvJitLink_120_0.dll", "nvToolsExt64_1.dll", "nvperf_host.dll", "nvrtc-builtins64_128.dll",
  "nvrtc64_120_0.alt.dll", "nvrtc64_120_0.dll",
];

/** The shared libraries of the Linux `nvidia-*` wheels the cu128 bundle installs. */
const LINUX = [
  "libcublas.so.12", "libcublasLt.so.12", "libcupti.so.12", "libcheckpoint.so", "libnvperf_host.so",
  "libnvperf_target.so", "libpcsamplingutil.so", "libnvrtc.so.12", "libnvrtc.alt.so.12",
  "libnvrtc-builtins.so.12.8", "libnvrtc-builtins.alt.so.12.8", "libcudart.so.12", "libcudnn.so.9",
  "libcudnn_adv.so.9", "libcudnn_cnn.so.9", "libcudnn_engines_precompiled.so.9",
  "libcudnn_engines_runtime_compiled.so.9", "libcudnn_graph.so.9", "libcudnn_heuristic.so.9",
  "libcudnn_ops.so.9", "libcufft.so.11", "libcufftw.so.11", "libcufile.so.0", "libcufile_rdma.so.1",
  "libcurand.so.10", "libcusolver.so.11", "libcusolverMg.so.11", "libcusparse.so.12", "libcusparseLt.so.0",
  "libnccl.so.2", "libnvJitLink.so.12", "libnvToolsExt.so.1", "libnvshmem_host.so.3",
  "nvshmem_bootstrap_mpi.so.3", "nvshmem_bootstrap_uid.so.3", "nvshmem_transport_ibrc.so.3",
  "nvshmem_transport_ucx.so.3",
];

describe("NVIDIA's files in the AI bundles", () => {
  it("leaves out the two Windows files its CUDA agreement does not list, and keeps the rest", () => {
    const { remove, unknown, keep } = classify(WINDOWS);
    expect(remove.sort()).toEqual(["cusolverMg64_11.dll", "nvperf_host.dll"]);
    expect(unknown).toEqual([]);
    expect(keep).toContain("cudnn64_9.dll");
    expect(keep).toContain("cublasLt64_12.dll");
    expect(keep).toContain("nvrtc64_120_0.alt.dll");
  });

  it("never touches PyTorch's own files", () => {
    const { other } = classify(WINDOWS);
    for (const own of ["torch_cuda.dll", "c10_cuda.dll", "caffe2_nvrtc.dll", "torch_python.dll", "shm.dll"]) {
      expect(other).toContain(own);
    }
  });

  it("leaves out the five Linux files its CUDA agreement does not list, whatever they are called", () => {
    const { remove, unknown } = classify(LINUX);
    // libcheckpoint and libpcsamplingutil are CUPTI's, and do not look like NVIDIA's at all.
    expect(remove.sort()).toEqual([
      "libcheckpoint.so", "libcusolverMg.so.11", "libnvperf_host.so", "libnvperf_target.so", "libpcsamplingutil.so",
    ]);
    expect(unknown).toEqual([]);
  });

  it("keeps what the cuDNN, cuSPARSELt, NVSHMEM and NCCL terms cover", () => {
    const { keep } = classify(LINUX);
    for (const name of ["libcudnn_ops.so.9", "libcusparseLt.so.0", "libnvshmem_host.so.3", "nvshmem_transport_ucx.so.3", "libnccl.so.2"]) {
      expect(keep).toContain(name);
    }
  });

  it("stops on an NVIDIA library no agreement was read for", () => {
    // What a newer PyTorch might add. The build fails on these until their terms are read and the
    // family is named in nvidia-files.mjs.
    const { unknown } = classify(["cuquantum64_1.dll", "libnvfuser_codegen.so", "nvidia_made_up64.dll", "libcusolverMgNew.so"]);
    expect(unknown.sort()).toEqual(["cuquantum64_1.dll", "libnvfuser_codegen.so", "nvidia_made_up64.dll"]);
  });

  it("does not take a family for a longer name that only begins with it", () => {
    // cusparse is covered; a library called cusparseSomethingNew is not, until it has been read.
    expect(rules.classifyNvidiaFile("libcusparse.so.12")).toBe("keep");
    expect(rules.classifyNvidiaFile("libcusparseSomethingNew.so.1")).toBe("unknown");
  });
});
