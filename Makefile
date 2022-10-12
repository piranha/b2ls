dev: node_modules
	wrangler dev

deploy:
	wrangler publish

####

node_modules:
	npm install
