import json, sys, pathlib
from jsonschema import Draft202012Validator, FormatChecker

def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result: raise ValueError('Duplicate manifest key: ' + key)
        result[key] = value
    return result

def read(path):
    return json.loads(pathlib.Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Non JSON constant')))

schema_path = pathlib.Path(sys.argv[1])
manifest_path = pathlib.Path(sys.argv[2])

schema = json.loads(schema_path.read_text(encoding='utf-8'))
manifest = read(manifest_path)

errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(manifest))
if errors:
    sys.exit('\n'.join(str(list(e.path)) + ': ' + e.message for e in errors))
print("PASS")
