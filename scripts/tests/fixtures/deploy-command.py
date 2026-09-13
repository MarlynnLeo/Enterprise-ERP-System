"""Isolated command doubles for the release transaction tests; never calls Docker."""
import fnmatch
import json
import os
from pathlib import Path
import shutil
import sys
from urllib.parse import urlparse

root = Path(os.environ['ERP_TEST_DIRECTORY']).resolve()
target = root / 'target'
state_file = root / 'state.json'
state = json.loads(state_file.read_text())
mode, *args = sys.argv[1:]
scenario = os.environ.get('ERP_TEST_SCENARIO', '')
release = os.environ['ERP_TEST_RELEASE']
new_tag = 'release-' + release
services = ['backend', 'frontend', 'mobile']


def save():
    state_file.write_text(json.dumps(state))


def image(ref):
    return state['images'].get(ref) or next((v for v in state['images'].values() if v['id'] == ref), None)


def selected_tag(service='backend'):
    values = dict(line.split('=', 1) for line in (target / '.env').read_text().splitlines() if '=' in line)
    default = os.environ.get('ERP_RELEASE_TAG') or values['ERP_RELEASE_TAG']
    return (os.environ.get('ERP_FRONTEND_RELEASE_TAG') or values.get('ERP_FRONTEND_RELEASE_TAG') or default) if service == 'frontend' else default


def output(value):
    print(value)


if mode == 'flock':
    sys.exit(1 if scenario == 'locked' else 0)

if mode == 'rsync':
    source, destination = [Path(v).resolve() for v in args[-2:]]
    assert source.is_relative_to(root) and destination.is_relative_to(root)
    excludes = [v.split('=', 1)[1] for v in args if v.startswith('--exclude=')]
    for item in list(destination.iterdir()):
        if any(fnmatch.fnmatch(item.name, pattern) for pattern in excludes):
            continue
        if not (source / item.name).exists():
            shutil.rmtree(item) if item.is_dir() else item.unlink()
    shutil.copytree(source, destination, dirs_exist_ok=True,
                    ignore=lambda _, names: [name for name in names if any(fnmatch.fnmatch(name, p) for p in excludes)])
    sys.exit(0)

if mode == 'curl':
    url = args[-1]
    port = urlparse(url).port
    assert port in [18081, 18082], url
    service = 'mobile' if port == 18082 else 'frontend'
    state.setdefault('requests', []).append(url)
    save()
    current = image('kacon-erp-' + service + ':' + state['containers'][service]).get('buildId', state['oldBuild'])
    if current == release and ((scenario == 'version' and service == 'frontend') or
                               (scenario == 'mobile-version' and service == 'mobile')):
        current = 'wrong-version'
    version = dict(buildId=current)
    if service == 'frontend':
        version['performanceContract'] = 2
    output(json.dumps(version))
    sys.exit(0)

assert mode == 'docker'
state['commands'].append(args)
save()

if args[0] == 'ps':
    output('\n'.join('kacon-erp-' + service + '-1' for service in services + ['redis']))
elif args[0] == 'inspect':
    fmt, container = args[2], args[3]
    service = container.removeprefix('kacon-erp-').removesuffix('-1')
    tag = state['containers'].get(service, 'redis')
    if 'working_dir' in fmt:
        output(os.environ['ERP_TEST_POSIX_TARGET'])
    elif 'config_files' in fmt:
        output(os.environ['ERP_TEST_POSIX_TARGET'] + '/docker-compose.yml')
    elif 'State.Health' in fmt:
        output('unhealthy' if scenario in ['health', 'frontend-health'] and tag == new_tag else 'healthy')
    elif fmt == '{{.Config.Image}}':
        output('kacon-erp-' + service + ':' + tag)
    elif fmt == '{{.Image}}':
        output(image('kacon-erp-' + service + ':' + tag)['id'])
    else:
        raise AssertionError(fmt)
elif args[:2] == ['image', 'inspect']:
    found = image(args[-1])
    if not found:
        sys.exit(1)
    if '--format' in args:
        fmt = args[args.index('--format') + 1]
        if fmt == '{{.Id}}':
            output(found['id'])
        else:
            output(found['labels'][fmt.split('"')[1]])
elif args[:2] == ['image', 'rm']:
    state['images'].pop(args[-1], None)
    save()
elif args[0] == 'build':
    tag = args[args.index('-t') + 1]
    service = tag.split(':')[0].removeprefix('kacon-erp-')
    if scenario == 'build' and service == 'frontend':
        sys.exit(1)
    labels = dict(args[i + 1].split('=', 1) for i, v in enumerate(args) if v == '--label')
    build_args = dict(args[i + 1].split('=', 1) for i, v in enumerate(args) if v == '--build-arg')
    state['images'][tag] = dict(id='sha256:new-' + service, labels=labels,
                              buildId=build_args.get('APP_BUILD_ID', 'unspecified-build'))
    save()
elif args[0] == 'tag':
    found = image(args[1])
    assert found is not None, args[1]
    state['images'][args[2]] = found
    save()
elif args[0] == 'run':
    entrypoint_index = args.index('--entrypoint')
    if args[entrypoint_index + 1] == 'cat':
        ref = args[entrypoint_index + 2]
        found = image(ref)
        assert found is not None, ref
        current = found['buildId']
        mobile = ref.startswith('kacon-erp-mobile:')
        if mobile and scenario == 'mobile-candidate-version':
            current = 'wrong-version'
        version = dict(buildId=current)
        if not mobile:
            version['performanceContract'] = 2
        output(json.dumps(version))
elif args[0] == 'compose':
    command = next(value for value in args if value in ['config', 'run', 'up', 'ps'])
    if command == 'config' and '--images' in args:
        output('\n'.join('kacon-erp-' + service + ':' + selected_tag(service) for service in services))
    if command == 'run':
        assert '-T' in args and '--interactive=false' in args
        # A release is streamed over stdin; migrations must see EOF, never
        # the shell commands that switch containers and verify the release.
        assert sys.stdin.read() == ''
        if scenario == 'missing-migrations' and 'node' in args:
            sys.exit(1)
    if command == 'run' and 'npm' in args and scenario == 'migration' and selected_tag() == new_tag:
        sys.exit(1)
    if command == 'up':
        tag = selected_tag()
        if scenario == 'container' and tag == new_tag:
            state['containers']['backend'] = tag
            save()
            sys.exit(1)
        affected = ['frontend'] if '--no-deps' in args else services
        for service in affected:
            state['containers'][service] = selected_tag(service)
        save()
    if command == 'ps' and '-q' in args:
        output('kacon-erp-' + args[-1] + '-1')
else:
    raise AssertionError(args)
