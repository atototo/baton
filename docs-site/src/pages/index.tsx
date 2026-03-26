import Layout from "@theme/Layout";
import { Redirect } from "@docusaurus/router";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home() {
  const introUrl = useBaseUrl("/start/what-is-baton");
  return (
    <Layout>
      <Redirect to={introUrl} />
    </Layout>
  );
}
