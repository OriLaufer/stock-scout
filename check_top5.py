"""Quick check: float, short interest, and volume for the current top 5.
Computes the data-driven recommendation score for each."""
import time
import yfinance as yf

TICKERS = ["HYLN", "AMBQ", "BRUN", "FCEL", "AEVA"]

def score_stock(info, fi):
    """Apply the data-driven scoring from forensic analysis."""
    score = 0
    reasons = []

    # FLOAT (the killer signal)
    fl = (info.get("floatShares") or 0) / 1e6
    if fl:
        if fl < 15:
            score += 5
            reasons.append(f"🔥 Tiny float ({fl:.1f}M) +5")
        elif fl < 30:
            score += 3
            reasons.append(f"Small float ({fl:.1f}M) +3")
        elif fl < 60:
            score += 1
            reasons.append(f"Medium float ({fl:.1f}M) +1")
        elif fl > 100:
            score -= 1
            reasons.append(f"Large float ({fl:.1f}M) -1")

    # VOLUME (mild confirmation)
    avg_vol = getattr(fi, "three_month_average_volume", None) or 0
    if avg_vol > 0:
        # Approximate weekly volume from recent history
        try:
            hist = yf.Ticker(info.get("symbol", "")).history(period="7d")
            week_vol = float(hist["Volume"].sum()) if not hist.empty else 0
            if week_vol > 0:
                ratio = week_vol / (avg_vol * 5)
                if ratio >= 4.0:
                    score += 2
                    reasons.append(f"Volume {ratio:.1f}x avg +2")
                elif ratio >= 2.0:
                    score += 1
                    reasons.append(f"Volume {ratio:.1f}x avg +1")
        except Exception:
            pass

    return max(0, score), reasons


print(f"{'TICKER':7} {'FLOAT':>10} {'SHORT%':>8} {'MCAP':>10} {'SCORE':>6} REASONS")
print("-" * 110)

results = []
for t in TICKERS:
    try:
        time.sleep(1.5)
        ticker_obj = yf.Ticker(t)
        info = ticker_obj.info
        info["symbol"] = t
        fi = ticker_obj.fast_info

        fl = (info.get("floatShares") or 0) / 1e6
        sp = (info.get("shortPercentOfFloat") or 0) * 100
        mc = (info.get("marketCap") or 0) / 1e9

        score, reasons = score_stock(info, fi)
        results.append({"ticker": t, "score": score, "float": fl, "reasons": reasons})

        reasons_txt = " · ".join(reasons) if reasons else "no positive signals"
        print(f"{t:7} {fl:>9.1f}M {sp:>7.1f}% {mc:>9.2f}B {score:>6} {reasons_txt}")
    except Exception as e:
        print(f"{t}: error — {type(e).__name__}: {e}")

# Winner
if results:
    print()
    winner = max(results, key=lambda x: x["score"])
    print(f"🔥 PICK OF THE WEEK: {winner['ticker']} (score {winner['score']})")
    print(f"   Why: {' · '.join(winner['reasons']) if winner['reasons'] else 'highest score'}")
