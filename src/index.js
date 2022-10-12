/* jshint esversion: 8 */

const removeHeaders = [
  'x-bz-content-sha1',
  'x-bz-file-id',
  'x-bz-file-name',
  'x-bz-info-src_last_modified_millis',
  'X-Bz-Upload-Timestamp',
  'Expires'
];


function humanBytes(x) {
  if (x < 1024) return x + ' B';
  for (var i = 0; x > 1024; i++) {
    x = x / 1024;
  }
  var size = " KMGTPE"[i];
  return `${x.toFixed(1)} ${size}B`;
}


/// b2

async function b2(config, apiName, ctx) {
  var url = `${config.apiUrl}/b2api/v2/${apiName}`;
  return await fetch(url, {
    method: 'POST',
    headers: {'Authorization': config.authorizationToken},
    body: JSON.stringify(ctx)
  });
}


// auth

async function getAuth(env) {
  var b64auth = btoa(`${env.B2ACCESS}:${env.B2SECRET}`);
  var res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: {'Authorization': `Basic ${b64auth}`}
  });
  return await res.json();
}

async function getBucketId(env, auth) {
  var res = await b2(auth, 'b2_list_buckets',
                     {accountId: auth.accountId, bucketName: env.B2BUCKET});
  var data = await res.json();
  return data.buckets[0].bucketId;
}

async function _getConfig(env) {
  var auth = await getAuth(env);
  var bucketId = await getBucketId(env, auth);

  return {
    accountId: auth.accountId,
    bucketId: bucketId,
    apiUrl: auth.apiUrl,
    authorizationToken: auth.authorizationToken
  };
}

async function getConfig(env, force) {
  var config;
  if (!force) {
    config = await env.B2LS.get('b2config');
  }
  if (config) {
    config = JSON.parse(config);
  } else {
    config = await _getConfig(env);
    await env.B2LS.put('b2config', JSON.stringify(config), {expirationTtl: 24*60*60});
  }
  return config;
}

/// directory

async function ls(req, env, opts) {
  const source = new URL(req.url);
  const config = await getConfig(env, opts && opts.forceAuth);

  var path = source.pathname.slice(1);
  if (path[path.length-1] != '/') {
    path += '/';
  }

  var res = await b2(config, 'b2_list_file_names',
                     {bucketId: config.bucketId, prefix: path});
  if (res.status != 200) {
    return res;
  }
  if (source.searchParams.has('raw')) {
    return res;
  }

  var data = await res.json();
  var files = data.files;
  files.sort((a, b) => {
    a.fileName.localeCompare(b.fileName);
  });

  var html = `<html><body><meta charset="utf-8">
  <style>
  table { text-align: left; }
  td, th { padding: 0.4rem 0.8rem; }
  </style>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      [].forEach.call(document.querySelectorAll('time'), function(t) {
        var d = new Date(t.innerText);
        t.innerText = d.toLocaleString();
      });
    });
  </script>
  <table>
    <tr><th>Name</th><th>Size</th><th>Date</th></tr>
    ${data.files.map(f => `<tr>
        <td><a href="/${f.fileName}" download>${f.fileName.slice(path.length)}</a></td>
        <td align=right title="${f.contentLength}">${humanBytes(f.contentLength)}</td>
        <td><time>${new Date(f.uploadTimestamp)}</time></td>
      </tr>`).join('\n')}
  </table>`;

  return new Response(html, {
    status: res.status,
    statusText: res.statusText,
    headers: {'Content-Type': 'text/html'}
  });
}

// file

function cleanHeaders(srcHeaders) {
  var headers = new Headers(srcHeaders);

  var etag = (headers.get('x-bz-content-sha1') ||
              headers.get('x-bz-info-src_last_modified_millis') ||
              headers.get('x-bz-file-id'));
  if (etag) {
    headers.set('ETag', etag);
  }

  removeHeaders.forEach(k => headers.delete(k));
  return headers;
}


async function fileReq(req, env) {
  const source = new URL(req.url);
  // pathname starts with a `/`
  const url = `https://f001.backblazeb2.com/file/${env.B2BUCKET}${source.pathname}`;

  var response = await fetch(url, {method: req.method});

  // maybe this is directory listing
  if (response.status == 404) {
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: cleanHeaders(response.headers),
  });
}

async function handleRequest(req, env) {
  var file = await fileReq(req, env);
  if (file.status != 404) {
    return file;
  }

  var dir = await ls(req, env);
  if (dir.status == 401) {
    var data = await dir.json();
    if (data.code == "expired_auth_token") {
      dir = await ls(req, env, {forceAuth: true});
    }
  }
  return dir;
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
