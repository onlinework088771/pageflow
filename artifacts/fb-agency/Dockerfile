FROM nginx:1.27-alpine

COPY artifacts/fb-agency/dist/public /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
