#!/bin/sh
# Downloads the brand and fallback fonts (plus their OFL texts) pinned to a
# google/fonts commit and verifies every sha256. Usage: fetch-fonts.sh <dir>
# Works on Alpine (busybox sha256sum, wget) and macOS (shasum, curl).
set -eu

DIR=${1:?usage: fetch-fonts.sh <dir>}
BASE=https://raw.githubusercontent.com/google/fonts/5e8a3ba899557829a76cfdac30fa512bda91d7ca/ofl

# family-dir|remote file name|local name|font sha256|OFL sha256
MANIFEST='neonderthaw|Neonderthaw-Regular.ttf|Neonderthaw.ttf|15a72ab630eb73ee922ad653783b81053cf381ef53bcc17a536f3c7fa8097184|OFL_NEONDERTHAW
bungee|Bungee-Regular.ttf|Bungee.ttf|c4f5361ce120af3e6b9156d0bf379fa19cda2ea0cd18ac01fd99596c6bf66e3f|OFL_BUNGEE
manrope|Manrope%5Bwght%5D.ttf|Manrope.ttf|3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6|OFL_MANROPE
notosanssc|NotoSansSC%5Bwght%5D.ttf|NotoSansSC.ttf|a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da|OFL_NOTOSANSSC
notosansarabic|NotoSansArabic%5Bwdth,wght%5D.ttf|NotoSansArabic.ttf|63111b5b2e074dd48cc67692e0a2726d86ee94c1c37fe8598257b7b4e87e869e|OFL_NOTOSANSARABIC
notosanshebrew|NotoSansHebrew%5Bwdth,wght%5D.ttf|NotoSansHebrew.ttf|7ef36a2c3593758cdb622e1bdef4f84523e92fbc3ccc667438dd80ff54c2de88|OFL_NOTOSANSHEBREW
notosans|NotoSans%5Bwdth,wght%5D.ttf|NotoSans.ttf|bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d|OFL_NOTOSANS
notoemoji|NotoEmoji%5Bwght%5D.ttf|NotoEmoji.ttf|de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551|OFL_NOTOEMOJI'

# sha256 of each family's OFL.txt at the pinned commit.
OFL_NEONDERTHAW=1b6b1362683d5bb1f864615e723b4323a3c05de5dd020e0e448546135bab75de
OFL_BUNGEE=d5787a50dde5be6c6daecab9ed459939b1bc37cff0d0e00257eaf1ec2cf4c16c
OFL_MANROPE=58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b
OFL_NOTOSANSSC=1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9
OFL_NOTOSANSARABIC=07fc70bfeb985cc1a87a8587d0a0c80bab11c86c9dc3fd95b6f0cb332f983e96
OFL_NOTOSANSHEBREW=9b9fe028b5ba74d231659a1bbaf0ed09b11e759d1ca6a070999e16d151616b47
OFL_NOTOSANS=cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a
OFL_NOTOEMOJI=500bb1ccf43df7bbb522112f9133a52b16e1c35e809632f5d8609b179152de5b

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d' ' -f1; }
else
  sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
fi

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
else
  fetch() { wget -q -O "$2" "$1"; }
fi

# download <url> <dest> <expected sha256>
download() {
  fetch "$1" "$2.part"
  actual=$(sha256 "$2.part")
  if [ "$actual" != "$3" ]; then
    rm -f "$2.part"
    echo "sha256 mismatch for $1: expected $3, got $actual" >&2
    exit 1
  fi
  mv "$2.part" "$2"
}

mkdir -p "$DIR/licenses"
echo "$MANIFEST" | while IFS='|' read -r family remote name font_sha ofl_var; do
  eval "ofl_sha=\${$ofl_var}"
  download "$BASE/$family/$remote" "$DIR/$name" "$font_sha"
  download "$BASE/$family/OFL.txt" "$DIR/licenses/$family-OFL.txt" "$ofl_sha"
  echo "ok $name"
done
