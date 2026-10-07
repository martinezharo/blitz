import pathlib, re
src = pathlib.Path(__file__).parent / "src"
parts = {p.stem.removesuffix(".part"): p.read_text() for p in src.glob("*.part.html")}
for page in ["a", "b", "c", "a-add-1", "a-add-2", "a-add-3"]:
    html = (src / f"{page}.html").read_text()
    while "{{" in html:
        html = re.sub(r"\{\{([\w-]+)\}\}", lambda m: parts[m.group(1)], html)
    (src.parent / f"{page}.html").write_text(html)
