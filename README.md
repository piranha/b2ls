# b2ls

A directory listing service for Backblaze B2 made with Cloudflare Workers. Turns
private B2 buckets into links you can share with others. There is no root
listing, so there is a bit of security by obscurity.

I use B2 to store my video archive (both sources and complete material), so this
turns it into a sharing mechanism as well without any need to use any other
services.

B2 is an S3-like storage service from Backblaze, a backup company, but much
cheaper (just 0.5 cents/gb/month). It has a partnership with Cloudflare where
traffic between B2 and Cloudflare is free. So this little service make it all
very cost-efficient.


## Usage

Copy `wrangler.toml.example` to `wrangler.toml` and read it through to supply
all the necessary things: `B2LS` KV namespace, (optional) custom domain, and B2
bucket, access key id and secret.
