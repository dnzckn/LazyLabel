# The Python inference service: SAM 1 and SAM 2.1 prompts, propagation, archetype finding.
#
# NEVER BUILT. See `deploy/README.md`. This one is the least verified of the three: it installs
# PyTorch against a CUDA base image, which is where container builds usually go wrong, and the
# checks in that README matter most here.
#
# OPT-IN in `compose.yaml` under the `ai` profile, because a deployment without it is a working
# install rather than a broken one — everything except SAM prompts and propagation works.

# The CUDA runtime rather than the devel image: nothing here compiles a kernel, and devel is
# several gigabytes larger for tooling this service never invokes.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# `requires-python = ">=3.10"`, and 22.04 ships 3.10 — so the distribution's own Python is used
# rather than a PPA or a source build. One fewer thing to keep current.
RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# A venv rather than installing into the system Python: Ubuntu's pip refuses to touch the system
# site-packages by default (PEP 668), and defeating that guard with --break-system-packages is
# exactly the sort of thing that works until an apt upgrade.
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /src
COPY lazylabel-reimagined/inference /src/inference

# The `ai` extra is what pulls torch, segment-anything, torchvision, scikit-learn and pillow.
# Without it the package installs and the service starts and reports no models, which is a useful
# thing to be able to do but is not what this image is for.
RUN pip install --no-cache-dir /src/inference[ai]

# NOT ROOT, and it matters more here than in the API image: this process loads model checkpoints,
# and RULE-084's weights-only guard is a code-level defence. Running unprivileged means a
# hypothetical bypass of it is confined.
RUN useradd --create-home --uid 10001 inference
USER inference

# The model directory is mounted read-only by compose. Nothing here writes a checkpoint and SEC-03
# forbids downloading one at runtime, so a writable mount could only ever be a way to go wrong.
ENV LAZYLABEL_MODEL_DIR=/models
ENV LAZYLABEL_INFERENCE_HOST=0.0.0.0
ENV LAZYLABEL_INFERENCE_PORT=8788

EXPOSE 8788

CMD ["python", "-m", "lazylabel_inference.server"]
