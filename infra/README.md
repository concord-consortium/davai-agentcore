# infra/ — infrastructure as code

Provisions the new stack in the **davai dev AWS account**: ECR repo, the AgentCore **runtime execution
role**, and the **AgentCore Runtime + endpoint** pointing at the pushed container image. Reuses existing
dev-account Secrets Manager entries for provider API keys.

Preferred tool: the **AgentCore starter toolkit** (`agentcore configure` / `launch`; CodeBuild builds, no
local Docker) unless we standardize on CDK/SAM.

_Empty scaffold — populated in P4 (deploy). Requires dev-account credentials (see
[`../docs/design.md`](../docs/design.md) § Access)._
