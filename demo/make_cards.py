#!/usr/bin/env python3
"""Generate Pri-Markets presenter cards (code slides) as 1920x1080 PNGs.
Brand: dark navy #050911, gold #E0A82E, cream #ECE7DC, teal #4FD1C5, mono type."""
import html, os, cairosvg

W, H = 1920, 1080
BG, PANEL, PANEL_BR = "#050911", "#0B121F", "#1B2740"
GOLD, CREAM, GREY, TEAL = "#E0A82E", "#ECE7DC", "#6B7893", "#4FD1C5"
COMMENT, KEY, STR, FN, NUM = "#5B6a86", "#7AA2F7", "#9ECE6A", "#E0A82E", "#FF9E64"

MONO = "'DejaVu Sans Mono','Courier New',monospace"
SANS = "'DejaVu Sans','Helvetica',sans-serif"

def esc(s): return html.escape(s, quote=True)

def spans(tokens):
    """tokens: list of (text,color). Returns tspan string."""
    return "".join(f'<tspan fill="{c}">{esc(t)}</tspan>' for t, c in tokens)

def code_block(lines, x, y, lh=56, size=34):
    out = []
    for i, toks in enumerate(lines):
        out.append(
            f'<text x="{x}" y="{y+i*lh}" font-family="{MONO}" '
            f'font-size="{size}" xml:space="preserve">{spans(toks)}</text>'
        )
    return "\n".join(out)

def card(idx, total, kicker, title, code_lines, caption):
    # Shrink line-height/size for denser cards so they never overflow the panel.
    n = len(code_lines)
    lh, size = (56, 34) if n <= 6 else (48, 29)
    y0 = 515 if n <= 6 else 500
    code_svg = code_block(code_lines, 150, y0, lh=lh, size=size)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BG}"/>
  <rect x="0" y="0" width="{W}" height="6" fill="{GOLD}"/>
  <!-- header -->
  <text x="120" y="130" font-family="{MONO}" font-size="40" font-weight="bold" fill="{GOLD}" letter-spacing="4">PRI</text>
  <text x="235" y="118" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">PREDICTION</text>
  <text x="235" y="140" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">MARKETS</text>
  <text x="{W-120}" y="130" text-anchor="end" font-family="{MONO}" font-size="22" fill="{GREY}" letter-spacing="2">{idx} / {total} · TECHNICAL HIGHLIGHT</text>
  <line x1="120" y1="175" x2="{W-120}" y2="175" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <!-- kicker + title -->
  <text x="120" y="270" font-family="{MONO}" font-size="26" fill="{TEAL}" letter-spacing="6">{esc(kicker)}</text>
  <text x="120" y="355" font-family="{SANS}" font-size="66" font-weight="bold" fill="{CREAM}">{esc(title)}</text>
  <!-- code panel -->
  <rect x="110" y="410" width="{W-220}" height="470" rx="14" fill="{PANEL}" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <circle cx="150" cy="450" r="9" fill="#E0555A"/><circle cx="182" cy="450" r="9" fill="{GOLD}"/><circle cx="214" cy="450" r="9" fill="{TEAL}"/>
  {code_svg}
  <!-- caption -->
  <line x1="120" y1="945" x2="{W-120}" y2="945" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <text x="120" y="1005" font-family="{SANS}" font-size="28" fill="{GREY}">{esc(caption)}</text>
  <text x="{W-120}" y="1052" text-anchor="end" font-family="{MONO}" font-size="22" fill="{GOLD}">pri-markets.vercel.app</text>
</svg>'''

# ---- Card A: encrypted input ------------------------------------------------
cardA_code = [
    [("const buf = ", CREAM), ("fhevmInst", CREAM), (".", GREY), ("createEncryptedInput", FN), ("(contractAddress, userAddress);", CREAM)],
    [("buf.", CREAM), ("add8", FN), ("(", CREAM), ("BigInt", FN), ("(side));", CREAM), ("   // 0 = NO, 1 = YES   (encrypted)", COMMENT)],
    [("buf.", CREAM), ("add64", FN), ("(amountRaw);", CREAM), ("     // cUSDC amount      (encrypted)", COMMENT)],
    [("const enc = ", CREAM), ("await", KEY), (" buf.", CREAM), ("encrypt", FN), ("();", CREAM)],
    [("", CREAM)],
    [("// handles[0]=side  handles[1]=amount  inputProof (shared)", COMMENT)],
]
# ---- Card B: on-ciphertext settlement ---------------------------------------
cardB_code = [
    [("euint64", KEY), (" winStake = m.outcome == SIDE_YES", CREAM)],
    [("    ? pos.yesStake : pos.noStake;", CREAM), ("   // side never read", COMMENT)],
    [("", CREAM)],
    [("euint64", KEY), (" encPayout = ", CREAM), ("FHE", FN), (".div(", CREAM), ("FHE", FN), (".mul(winStake, distributable), winPool);", CREAM)],
    [("FHE", FN), (".allow(encPayout, msg.sender);", CREAM), ("      // ACL: only claimer decrypts", COMMENT)],
    [("token.", CREAM), ("confidentialTransfer", FN), ("(msg.sender, encPayout);", CREAM)],
]

# ---- Card C: Q13 fixed-point overflow guard ---------------------------------
cardC_code = [
    [("// euint64 multiply wraps mod 2^64 — guard the product", COMMENT)],
    [("if", KEY), (" (winPool == ", CREAM), ("0", NUM), (") encPayout = ", CREAM), ("FHE", FN), (".asEuint64(", CREAM), ("0", NUM), (");", CREAM)],
    [("else if", KEY), (" (distributable <= ", CREAM), ("MAX", NUM), (" / winPool)", CREAM)],
    [("    encPayout = ", CREAM), ("FHE", FN), (".div(", CREAM), ("FHE", FN), (".mul(winStake, distributable), winPool);", CREAM)],
    [("else", KEY), (" {", CREAM), ("                          // Q13 fixed-point path", COMMENT)],
    [("    uint256", KEY), (" ratioQ13 = (distributable << ", CREAM), ("13", NUM), (") / winPool;", CREAM)],
    [("    encPayout = ", CREAM), ("FHE", FN), (".shr(", CREAM), ("FHE", FN), (".mul(winStake, ratioQ13), ", CREAM), ("13", NUM), (");", CREAM)],
    [("}", CREAM)],
]

def title_card():
    pillars = [
        ("SEALED ACCUMULATION", "Side + amount encrypted end-to-end"),
        ("AGGREGATE REVEAL", "One clearing price at epoch close"),
        ("FHE SETTLEMENT", "Payout computed on ciphertext"),
    ]
    rows = []
    for i, (h, s) in enumerate(pillars):
        y = 560 + i * 130
        rows.append(
            f'<text x="150" y="{y}" font-family="{MONO}" font-size="34" fill="{GOLD}" letter-spacing="2">{esc(h)}</text>'
            f'<text x="150" y="{y+42}" font-family="{SANS}" font-size="28" fill="{GREY}">{esc(s)}</text>'
            f'<line x1="150" y1="{y+72}" x2="{W-150}" y2="{y+72}" stroke="{PANEL_BR}" stroke-width="1"/>'
        )
    body = "\n".join(rows)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BG}"/>
  <rect x="0" y="0" width="{W}" height="6" fill="{GOLD}"/>
  <text x="150" y="230" font-family="{MONO}" font-size="120" font-weight="bold" fill="{GOLD}" letter-spacing="8">PRI</text>
  <text x="150" y="310" font-family="{MONO}" font-size="40" fill="{CREAM}" letter-spacing="14">PREDICTION MARKETS</text>
  <text x="150" y="420" font-family="{SANS}" font-size="46" font-weight="bold" fill="{CREAM}">Sealed-bid prediction markets on Zama fhEVM</text>
  <text x="150" y="472" font-family="{SANS}" font-size="30" fill="{TEAL}">Your side and amount stay encrypted — through settlement.</text>
  {body}
  <line x1="150" y1="960" x2="{W-150}" y2="960" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <text x="150" y="1020" font-family="{MONO}" font-size="26" fill="{GREY}">Live on Sepolia</text>
  <text x="{W-150}" y="1020" text-anchor="end" font-family="{MONO}" font-size="28" fill="{GOLD}">pri-markets.vercel.app</text>
</svg>'''

def closing_card():
    links = [
        ("LIVE APP", "pri-markets.vercel.app"),
        ("CONTRACT", "sepolia.etherscan.io · 0xF00573Fb…0d41C1"),
        ("PROFILER", "github.com/fhe-profiler/fhe-gas-profiler · npm"),
        ("STACK", "fhEVM · @fhevm/solidity 0.11 · cUSDC (ERC-7984) · React + Vite"),
    ]
    rows = []
    for i, (h, s) in enumerate(links):
        y = 500 + i * 110
        rows.append(
            f'<text x="150" y="{y}" font-family="{MONO}" font-size="26" fill="{TEAL}" letter-spacing="3">{esc(h)}</text>'
            f'<text x="470" y="{y}" font-family="{MONO}" font-size="30" fill="{CREAM}">{esc(s)}</text>'
            f'<line x1="150" y1="{y+34}" x2="{W-150}" y2="{y+34}" stroke="{PANEL_BR}" stroke-width="1"/>'
        )
    body = "\n".join(rows)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BG}"/>
  <rect x="0" y="0" width="{W}" height="6" fill="{GOLD}"/>
  <text x="150" y="200" font-family="{MONO}" font-size="40" font-weight="bold" fill="{GOLD}" letter-spacing="4">PRI</text>
  <text x="265" y="188" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">PREDICTION</text>
  <text x="265" y="210" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">MARKETS</text>
  <text x="150" y="340" font-family="{SANS}" font-size="70" font-weight="bold" fill="{CREAM}">Front-running,</text>
  <text x="150" y="420" font-family="{SANS}" font-size="70" font-weight="bold" fill="{CREAM}">structurally impossible.</text>
  {body}
  <line x1="150" y1="1000" x2="{W-150}" y2="1000" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <text x="{W-150}" y="1052" text-anchor="end" font-family="{MONO}" font-size="24" fill="{GOLD}">pri-markets.vercel.app</text>
</svg>'''

def flow_card():
    x0, WB, STEP, ytop, ybot, ymid = 90, 250, 298, 300, 510, 405
    def bx(i): return x0 + i * STEP
    nodes = [
        ("1 · ENCRYPT",    "browser",           "add8+add64 · proof", TEAL),
        ("2 · PLACE BET",  "wrap USDC → cUSDC",  "placeBet(handles)",  TEAL),
        ("3 · ACCUMULATE", "epoch open",         "sealed sub-pools",   GOLD),
        ("4 · RESOLVE",    "keeper · Chainlink", "resolveByOracle",    GOLD),
        ("5 · REVEAL",     "Zama KMS",           "aggregate + fee",    GOLD),
        ("6 · CLAIM",      "on-ciphertext",      "userDecrypt/EIP712", CREAM),
    ]
    boxes = []
    for i, (t, l1, l2, c) in enumerate(nodes):
        x = bx(i)
        boxes.append(
            f'<rect x="{x}" y="{ytop}" width="{WB}" height="{ybot-ytop}" rx="12" fill="{PANEL}" stroke="{PANEL_BR}" stroke-width="1.5"/>'
            f'<rect x="{x}" y="{ytop}" width="{WB}" height="5" rx="2" fill="{c}"/>'
            f'<text x="{x+20}" y="{ytop+56}" font-family="{MONO}" font-size="23" font-weight="bold" fill="{c}">{esc(t)}</text>'
            f'<text x="{x+20}" y="{ytop+112}" font-family="{MONO}" font-size="19" fill="{CREAM}">{esc(l1)}</text>'
            f'<text x="{x+20}" y="{ytop+144}" font-family="{MONO}" font-size="17" fill="{GREY}">{esc(l2)}</text>'
        )
    arrows = []
    for i in range(len(nodes) - 1):
        ax1, ax2 = bx(i) + WB + 6, bx(i+1) - 6
        arrows.append(
            f'<line x1="{ax1}" y1="{ymid}" x2="{ax2-12}" y2="{ymid}" stroke="{GOLD}" stroke-width="3"/>'
            f'<polygon points="{ax2-12},{ymid-7} {ax2},{ymid} {ax2-12},{ymid+7}" fill="{GOLD}"/>'
        )
    bands = []
    for label, a, b, c in [("BID", 0, 1, TEAL), ("SETTLE  ·  permissionless keeper", 2, 4, GOLD), ("CLAIM", 5, 5, CREAM)]:
        xs, xe = bx(a), bx(b) + WB
        bands.append(
            f'<text x="{(xs+xe)//2}" y="{ytop-38}" text-anchor="middle" font-family="{MONO}" font-size="20" fill="{c}" letter-spacing="3">{esc(label)}</text>'
            f'<line x1="{xs}" y1="{ytop-22}" x2="{xe}" y2="{ytop-22}" stroke="{c}" stroke-width="1.5" opacity="0.5"/>'
        )
    def lane(y, accent, tag, detail):
        return (
            f'<rect x="90" y="{y}" width="1740" height="88" rx="12" fill="{PANEL}" stroke="{PANEL_BR}" stroke-width="1.5"/>'
            f'<rect x="90" y="{y}" width="6" height="88" rx="3" fill="{accent}"/>'
            f'<text x="130" y="{y+53}" font-family="{MONO}" font-size="22" font-weight="bold" fill="{accent}" letter-spacing="1">{esc(tag)}</text>'
            f'<text x="470" y="{y+53}" font-family="{SANS}" font-size="27" fill="{CREAM}">{esc(detail)}</text>'
        )
    lanes = (
        lane(585, TEAL, "ENCRYPTED  E2E", "side  ·  amount  ·  each individual payout  —  never revealed")
        + lane(690, GOLD, "PUBLIC @ REVEAL", "YES / NO aggregate  ·  one clearing price  ·  2% fee → treasury")
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <rect width="{W}" height="{H}" fill="{BG}"/>
  <rect x="0" y="0" width="{W}" height="6" fill="{GOLD}"/>
  <text x="120" y="130" font-family="{MONO}" font-size="40" font-weight="bold" fill="{GOLD}" letter-spacing="4">PRI</text>
  <text x="235" y="118" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">PREDICTION</text>
  <text x="235" y="140" font-family="{MONO}" font-size="19" fill="{GREY}" letter-spacing="3">MARKETS</text>
  <text x="{W-120}" y="130" text-anchor="end" font-family="{MONO}" font-size="22" fill="{GREY}" letter-spacing="2">END-TO-END PIPELINE</text>
  <line x1="120" y1="175" x2="{W-120}" y2="175" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <text x="120" y="232" font-family="{SANS}" font-size="34" font-weight="bold" fill="{CREAM}">Sealed bid → aggregate reveal → confidential claim</text>
  {"".join(bands)}
  {"".join(boxes)}
  {"".join(arrows)}
  {lanes}
  <line x1="120" y1="855" x2="{W-120}" y2="855" stroke="{PANEL_BR}" stroke-width="1.5"/>
  <text x="120" y="915" font-family="{SANS}" font-size="26" fill="{GREY}">Steps 4–5 are permissionless — a keeper auto-resolves + reveals in ~30 s. No plaintext side or amount ever hits the chain.</text>
  <text x="{W-120}" y="1035" text-anchor="end" font-family="{MONO}" font-size="22" fill="{GOLD}">pri-markets.vercel.app</text>
</svg>'''

os.makedirs("cards", exist_ok=True)
jobs = [
    ("card-00-title", title_card()),
    ("card-01-pipeline", flow_card()),
    ("card-a-encrypted-input", card(1, 3, "SEALED INPUT",
        "One proof — side AND amount encrypted", cardA_code,
        "Side and amount stay ciphertext — through storage, events, and settlement.")),
    ("card-b-ciphertext-settlement", card(2, 3, "CONFIDENTIAL SETTLEMENT",
        "Payout computed on ciphertext", cardB_code,
        "Settlement math runs in the coprocessor; only the claimer can decrypt their own payout.")),
    ("card-c-q13-overflow-guard", card(3, 3, "FHE ARITHMETIC",
        "Q13 fixed-point overflow guard", cardC_code,
        "Correct FHE math under a 64-bit ceiling — precision cost bounded below 0.013%.")),
    ("card-99-close", closing_card()),
]
for name, svg in jobs:
    with open(f"cards/{name}.svg", "w") as f:
        f.write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f"cards/{name}.png",
                     output_width=W, output_height=H)
    print("wrote", name)
print("done")
