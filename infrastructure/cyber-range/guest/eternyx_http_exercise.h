/* Fixed synthetic HTTP security training fixture.
 * No filesystem access, outbound sockets, shell, credentials or arbitrary routing.
 * Only exact HTTP/1.1 requests with the synthetic host and close header are accepted.
 */
#ifndef ETERNYX_HTTP_EXERCISE_H
#define ETERNYX_HTTP_EXERCISE_H

#define EX_REQUEST_END " HTTP/1.1\r\nHost: lab\r\nConnection: close\r\n\r\n"
static int exercise_match(const char *request,size_t length,const char *expected) {
    return length==strlen(expected) && !memcmp(request,expected,length);
}
static int exercise_http(const char *request,size_t length,char *out,size_t capacity) {
    const char *status=NULL,*body=NULL,*allow="";
    if (exercise_match(request,length,"GET /health" EX_REQUEST_END)) {
        status="200 OK"; body="{\"status\":\"ready\"}";
    } else if (exercise_match(request,length,"GET /api/profile" EX_REQUEST_END)) {
        status="200 OK"; body="{\"role\":\"learner\",\"data\":\"synthetic\"}";
    } else if (exercise_match(request,length,"GET /api/admin" EX_REQUEST_END)) {
        status="403 Forbidden"; body="{\"error\":\"forbidden\"}";
    } else if (exercise_match(request,length,"GET /api/missing" EX_REQUEST_END)) {
        status="404 Not Found"; body="{\"error\":\"not_found\"}";
    } else if (exercise_match(request,length,"POST /api/profile" EX_REQUEST_END)) {
        status="405 Method Not Allowed"; body="{\"error\":\"method_not_allowed\"}";
        allow="Allow: GET\r\n";
    } else {
        return -1;
    }
    int n=snprintf(out,capacity,
        "HTTP/1.1 %s\r\nContent-Type: application/json\r\n"
        "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n"
        "Connection: close\r\n%sContent-Length: %zu\r\n\r\n%s",
        status,allow,strlen(body),body);
    return n>=0 && (size_t)n<capacity ? n : -1;
}
#endif
