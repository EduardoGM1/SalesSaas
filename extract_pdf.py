from pathlib import Path
path = Path(r'C:\dev\SalesApp\sales-app\pdf salesapp.pdf')
try:
    import pypdf
    reader = pypdf.PdfReader(str(path))
    for i,page in enumerate(reader.pages):
        print(f"--- PAGE {i+1} ---")
        print(page.extract_text() or "")
except Exception as e:
    print("ERROR:", type(e).__name__, e)
