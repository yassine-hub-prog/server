const supabase = require('./supabase');
const hashtags = require('./hashtags.json');

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());

app.get('/api/hashtags', (req, res) => {
    try {
        res.status(200).json(hashtags); // Envoyer tous les hashtags au format JSON
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des hashtags.');
    }
});



app.get('/api/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params; // Récupérer l'ID de l'utilisateur principal depuis les paramètres de la requête

        // Récupérer les données de l'utilisateur principal
        const { data: userData, error: userError } = await supabase
            .from('users_infos')
            .select('username, uuid, avatar, bios, badge')
            .eq('uuid', userId)
            .single();

        if (userError) {
            throw userError;
        }

        // Récupérer les données des utilisateurs suivis par l'utilisateur principal dans la table "follow"
        const { data: followData, error: followError } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId)
            .limit(5); // Limiter à 5 utilisateurs suivis

        if (followError) {
            throw followError;
        }

        // Récupérer les détails des utilisateurs suivis
        const followIds = followData.map(follow => follow.toid);
        const { data: followUserData, error: followUserError } = await supabase
            .from('users_infos')
            .select('username, uuid, avatar, badge')
            .in('uuid', followIds);

        if (followUserError) {
            throw followUserError;
        }

        // Récupérer le nombre de personnes que l'utilisateur suit (followers)
        const { data: followersCountData, error: followersCountError } = await supabase
            .from('follow')
            .select('*')
            .eq('toid', userId);

        if (followersCountError) {
            throw followersCountError;
        }

        // Récupérer le nombre de personnes qui suivent l'utilisateur (following)
        const { data: followingCountData, error: followingCountError } = await supabase
            .from('follow')
            .select('*')
            .eq('fromid', userId);

        if (followingCountError) {
            throw followingCountError;
        }

        // Récupérer le nombre de posts de type "image"
        const { data: imagePostsData, error: imagePostsError } = await supabase
            .from('post')
            .select('id, src')
            .eq('type', 'post')
            .eq('uuid', userId);

        if (imagePostsError) {
            throw imagePostsError;
        }

        // Récupérer le nombre de posts de type "shorts"
        const { data: shortsPostsData, error: shortsPostsError } = await supabase
            .from('post')
            .select('id, src, text')
            .eq('type', 'video')
            .eq('uuid', userId);

        if (shortsPostsError) {
            throw shortsPostsError;
        }

        // Récupérer le nombre de posts de type "ripple"
        const { data: ripplePostsData, error: ripplePostsError } = await supabase
            .from('post')
            .select('id, text')
            .eq('type', 'note')
            .eq('uuid', userId);

        if (ripplePostsError) {
            throw ripplePostsError;
        }

        // Organiser les données pour la réponse
        const responseData = {
            user: userData,
            follows: followUserData,
            followersCount: followersCountData.length,
            followingCount: followingCountData.length,
            PostsCount: imagePostsData.length + shortsPostsData.length + ripplePostsData.length,
            PostImage: imagePostsData,
            PostVideo: shortsPostsData,
            PostRipple: ripplePostsData,
        };

        res.send(responseData);
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});




app.get('/api/contact/:userId', async (req, res) => {
    
    try {
        const userId = req.params.userId;

        // Interroger la base de données Supabase pour récupérer les utilisateurs suivis par userId
        const { data, error } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId);

        if (error) {
            console.error('Erreur lors de la requête Supabase:', error.message);
            return res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
        }

        // Extraire les IDs des utilisateurs suivis
        const followedUserIds = data.map(item => item.toid);

        const usersInfoPromises = followedUserIds.map(async id => {
            // Récupérer le dernier message du contact dont le statut est faux (false)
            const { data: lastMessageData, error: lastMessageError } = await supabase
                .from('message')
                .select('message, created_at')
                .or(`and(fromid.eq.${id},toid.eq.${userId}),and(fromid.eq.${userId},toid.eq.${id})`)
                .order('created_at', { ascending: false })
                .limit(1)
            if (lastMessageError) {
                throw lastMessageError;
            }

            // Compter le nombre total de messages pour chaque contact
            const { data: messageCountData, error: messageCountError } = await supabase
                .from('message')
                .select('id')
                .eq('statue', false)
                .eq('toid', userId)
                .eq('fromid', id);

            if (messageCountError) {
                throw messageCountError;
            }

            const { data: contactuserinfos , error: contactuserinfoserror} = await supabase
                .from('users_infos')
                .select('username, avatar, uuid')
                .eq('uuid', id)
                .single();

            if(contactuserinfoserror) {
                throw contactuserinfoserror;
            }
            return {
                userInfo: contactuserinfos,
                lastMessage: lastMessageData,
                messageCount: messageCountData.length,
            };
        });

        // Attendre que toutes les requêtes pour les informations des utilisateurs suivis soient terminées
        const usersInfoResults = await Promise.all(usersInfoPromises);
        const totalMessages = usersInfoResults.reduce((acc, cur) => acc + cur.messageCount, 0);
        // Trier les contacts par ordre décroissant de la date du dernier message
        const sortedContacts = usersInfoResults.sort((a, b) => {
            const lastMessageA = a.lastMessage[0]; // Supposant qu'il y a toujours un dernier message
            const lastMessageB = b.lastMessage[0]; // Supposant qu'il y a toujours un dernier message

            if (!lastMessageA || !lastMessageB) {
                return 0; // Si l'un des contacts n'a pas de dernier message, la comparaison est neutre
            }

            // Comparer les dates des derniers messages pour le tri
            return new Date(lastMessageB.created_at) - new Date(lastMessageA.created_at);
        });

        res.status(200).json({ contacts: sortedContacts, totalMessages });

    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});

app.get('/api/posts/following/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Récupérer les utilisateurs suivis par userId
        const { data: followedUsersData, error: followedUsersError } = await supabase
            .from('follow')
            .select('toid')
            .eq('fromid', userId);

        if (followedUsersError) {
            console.error('Erreur lors de la requête Supabase pour récupérer les utilisateurs suivis:', followedUsersError.message);
            return res.status(500).send('Erreur lors de la récupération des utilisateurs suivis depuis Supabase.');
        }

        // Extraire les IDs des utilisateurs suivis
        const followedUserIds = followedUsersData.map(item => item.toid);

        // Récupérer tous les posts des utilisateurs suivis depuis la table posts
        const { data: allPostsData, error: allPostsError } = await supabase
            .from('posts')
            .select('id, src, text, type, tage, hashtag, uuid') // Ajouter uuid pour récupérer l'ID de l'utilisateur associé à chaque post
            .in('uuid', followedUserIds);

        if (allPostsError) {
            console.error('Erreur lors de la récupération des posts depuis Supabase:', allPostsError.message);
            return res.status(500).send('Erreur lors de la récupération des posts depuis Supabase.');
        }

        if (allPostsData.length > 0) {
            // Insérer un post publicitaire (ads) après chaque groupe de deux posts
            const postsWithAdsAndRecommendations = [];
            for (let i = 0; i < allPostsData.length; i++) {
                postsWithAdsAndRecommendations.push(allPostsData[i]);

                // Insérer les recommandations après chaque groupe de deux posts
                if ((i + 1) % 2 === 0 && i !== allPostsData.length - 1) {
                    // Récupérer 5 utilisateurs recommandés
                    const { data: recommendedUsersData, error: recommendedUsersError } = await supabase
                        .from('users_infos_random')
                        .select('username, avatar, badge')
                        .limit(10); // Limiter à 5 utilisateurs recommandés

                    if (recommendedUsersError) {
                        console.error('Erreur lors de la récupération des utilisateurs recommandés depuis Supabase:', recommendedUsersError.message);
                        return res.status(500).send('Erreur lors de la récupération des utilisateurs recommandés depuis Supabase.');
                    }

                    const recommendedUsers = recommendedUsersData.map(user => ({
                        username: user.username,
                        avatar: user.avatar,
                        badge: user.badge
                    }));

                    // Ajouter les utilisateurs recommandés à la liste des posts avec publicités et recommandations
                    postsWithAdsAndRecommendations.push({ recommendedUsers });
                }

                // Insérer un post publicitaire (ads) après chaque groupe de deux posts
                if ((i + 1) % 4 === 0 && i !== allPostsData.length - 1) {
                    // Récupérer un post publicitaire (ads) aléatoire depuis la table adsrandom
                    const today = new Date().toISOString().split('T')[0]; // Date actuelle au format ISO YYYY-MM-DD
                    const { data: adsData, error: adsError } = await supabase
                        .from('ads_random')
                        .lte('start_date', today) // Start date <= date actuelle
                        .gte('end_date', today) // End date >= date actuelle
                        .select('id, title, description, ad_type, src, uuid, website, country')
                        .limit(1);

                    if (adsError) {
                        console.error('Erreur lors de la récupération du post publicitaire depuis Supabase:', adsError.message);
                        return res.status(500).send('Erreur lors de la récupération du post publicitaire depuis Supabase.');
                    }

                    const adData = adsData[0]; // Récupérer les données du post publicitaire

                    // Récupérer les informations de l'utilisateur qui a posté le post publicitaire
                    const { data: userData, error: userError } = await supabase
                        .from('users_infos')
                        .select('username, avatar, badge') // Ajouter les champs que vous souhaitez récupérer
                        .eq('uuid', adData.uuid)
                        .single();

                    if (userError) {
                        console.error('Erreur lors de la récupération des informations utilisateur depuis Supabase:', userError.message);
                        return res.status(500).send('Erreur lors de la récupération des informations utilisateur depuis Supabase.');
                    }

                    // Ajouter les informations de l'utilisateur à l'annonce publicitaire
                    postsWithAdsAndRecommendations.push({
                        id: adData.id,
                        uuid: adData.uuid,
                        title: adData.title,
                        content: adData.description,
                        type: adData.ad_type,
                        src: adData.src,
                        website: adData.website,
                        user: { username: userData.username, avatar: userData.avatar, badge: userData.badge }
                    });
                }
            }

            res.status(200).json({ posts: postsWithAdsAndRecommendations });
        } else {
            // S'il n'y a pas de posts, afficher uniquement les utilisateurs recommandés
            const { data: recommendedUsersData, error: recommendedUsersError } = await supabase
                .from('users_infos_random')
                .select('username, avatar, badge')
                .limit(10); // Limiter à 5 utilisateurs recommandés

            if (recommendedUsersError) {
                console.error('Erreur lors de la récupération des utilisateurs recommandés depuis Supabase:', recommendedUsersError.message);
                return res.status(500).send('Erreur lors de la récupération des utilisateurs recommandés depuis Supabase.');
            }

            const recommendedUsers = recommendedUsersData.map(user => ({
                username: user.username,
                avatar: user.avatar,
                badge: user.badge
            }));

            res.status(200).json({ recommendedUsers });
        }
    } catch (error) {
        console.error('Erreur:', error.message);
        res.status(500).send('Erreur lors de la récupération des données depuis Supabase.');
    }
});





app.listen(3000, () => console.log('Server is listening on port 3000 🚀'));
