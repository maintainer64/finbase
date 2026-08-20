declare const __APP_REPO__: string;
import {swFetch} from "@/shared/sw-fetch";


interface GithubVersion {
    tagName?: string
    releaseName?: string
}

export async function getGithubLastVersion(): Promise<GithubVersion> {
    try {
        const response = await swFetch(`https://api.github.com/repos/${__APP_REPO__}/releases/latest`);
        const payload = await response.json()
        return {
            tagName: payload?.tag_name,
            releaseName: payload?.release_name,
        }
    } catch (err) {
        return {}
    }

}