#!/bin/bash
# Resolve the :<tag> of the app images to deploy for a commit (#3073).
#
# docker-publish only builds on pushes that touch image inputs (packages/,
# prisma/, Dockerfile*, nginx/, root package manifests, CHANGELOG.md), so a
# docs/compose/CI-only commit on main has no :<sha> images. Deploying such a
# commit must reuse the newest ancestor image tag, but only when nothing that
# feeds an image changed between that ancestor and the commit.
#
# Sourced by deploy.sh. KEEP IN SYNC with docker-publish.yml's push.paths.

IMAGE_INPUT_PATHS=(
    packages prisma Dockerfile 'Dockerfile.*' nginx
    package.json package-lock.json CHANGELOG.md
)
IMAGE_SERVICES=(bot backend frontend nginx render)

# Succeeds when every service image exists for tag $1 (render is optional so a
# commit that predates the render service still resolves). Override the probe
# with IMAGE_TAG_EXISTS_CMD "<service> <tag>" (used by tests).
image_tag_exists() {
    local tag="$1" svc
    for svc in "${IMAGE_SERVICES[@]}"; do
        if [[ -n "${IMAGE_TAG_EXISTS_CMD:-}" ]]; then
            "$IMAGE_TAG_EXISTS_CMD" "$svc" "$tag" || { [[ "$svc" == "render" ]] && continue; return 1; }
        else
            docker manifest inspect "${IMAGE_PREFIX:-ghcr.io/lucassantana-dev/lucky}-${svc}:${tag}" \
                >/dev/null 2>&1 || { [[ "$svc" == "render" ]] && continue; return 1; }
        fi
    done
    return 0
}

# resolve_image_tag <git-dir> <sha>
# Prints the tag to deploy and returns 0. Returns 1 (message on stderr, nothing
# printed) when neither the commit nor a safe ancestor has images.
resolve_image_tag() {
    local repo="$1" sha="$2" short cand
    short="${sha:0:7}"
    if image_tag_exists "$short"; then
        printf '%s\n' "$short"
        return 0
    fi
    if ! git -C "$repo" cat-file -e "${sha}^{commit}" 2>/dev/null; then
        echo "no images for ${short} and the commit is not in the checkout" >&2
        return 1
    fi
    while read -r cand; do
        [[ -n "$cand" ]] || continue
        if ! git -C "$repo" diff --quiet "$cand" "$sha" -- "${IMAGE_INPUT_PATHS[@]}"; then
            echo "no images for ${short} and image inputs changed since ${cand:0:7}" >&2
            return 1
        fi
        if image_tag_exists "${cand:0:7}"; then
            printf '%s\n' "${cand:0:7}"
            return 0
        fi
    done < <(git -C "$repo" rev-list --first-parent --skip=1 --max-count="${IMAGE_TAG_MAX_WALK:-50}" "$sha")
    echo "no images for ${short} or its last ${IMAGE_TAG_MAX_WALK:-50} ancestors" >&2
    return 1
}
