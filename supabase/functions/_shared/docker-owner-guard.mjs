// Docker owner boundaries operate on the server-authenticated getUser() result.
// Never accept owner IDs from browser JSON or signed-agent self-report fields.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function verifiedDockerOwnerId(user,serviceClient){
  if(!user||!serviceClient||typeof serviceClient!=="object"||
     typeof user.id!=="string"||!UUID.test(user.id)||
     user.is_anonymous===true)return null;
  return user.id;
}
