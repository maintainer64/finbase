import {Collapsible} from "@/components/ui/collapsible";
import {FaSolidRotate} from "solid-icons/fa";
import {AsyncButton} from "@/components/ui/button";
import {createResource, Show} from "solid-js";
import {getGithubLastVersion} from "@/shared/providers/github-version";

declare const __APP_VERSION__: string;
declare const __APP_REPO__: string;

export const VersionApp = () => {
    const [data] = createResource(getGithubLastVersion)
    return (
        <Collapsible title={`Версия расширения ${__APP_VERSION__}`} defaultOpen={false}>
            <div class="space-y-4">
                <div>
                    <Show when={data()?.tagName === undefined}>
                        <AsyncButton
                            icon={<FaSolidRotate/>}
                            label={`Ищем последнюю версию`}
                            disabled={true}
                            onClick={() => undefined}/>
                    </Show>
                    <Show when={data()?.tagName !== undefined && data()?.tagName === `v${__APP_VERSION__}`}>
                        <AsyncButton
                            icon={<FaSolidRotate/>}
                            label={`Вы используете последнюю версию расширения`}
                            disabled={true}
                            onClick={() => undefined}/>
                    </Show>
                    <Show when={data()?.tagName !== undefined && data()?.tagName !== `v${__APP_VERSION__}`}>
                        <AsyncButton
                            icon={<FaSolidRotate/>}
                            label={`Установить последнюю версию ${data()?.tagName}`}
                            disabled={false}
                            onClick={() => {
                                window.open(`https://github.com/${__APP_REPO__}/releases/latest`, "_blank");
                            }}/>
                    </Show>
                </div>
            </div>
        </Collapsible>
    );
};
